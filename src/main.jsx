import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Barcode, Camera, Check, ChevronDown, CircleHelp, ExternalLink, History, PackagePlus, Plus, Search, Settings2, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import './style.css';

const CATALOG_KEY = 'limpia.catalog.v1';
const HISTORY_KEY = 'limpia.history.v1';
const SOURCES = [
  { id: 'local', label: 'Mi catálogo', kind: 'local' },
  { id: 'sepa', label: 'SEPA · Precios Claros', kind: 'api' },
  { id: 'ez', label: 'ez-catalog · 87 fuentes', kind: 'api', url: 'https://landing.huggian.com/ez-catalog' },
  { id: 'opf', label: 'Open Products Facts', kind: 'api' },
  { id: 'upc', label: 'UPCitemdb', kind: 'api' },
  { id: 'gs1', label: 'GS1 Argentina', kind: 'manual', url: 'https://www.gs1.org.ar/Site/Servicios_Bootstrap5/VerifiedGO.html' },
];

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const tidy = (s) => (s || '').replace(/\s+/g, ' ').trim();
function normalizeProduct(raw, source) {
  return {
    barcode: String(raw.barcode || raw.code || ''),
    name: tidy(raw.name || raw.product_name || raw.title),
    brand: tidy(raw.brand || raw.brands),
    quantity: tidy(raw.quantity || raw.size || raw.net_content),
    image: raw.image || raw.image_url || '',
    category: tidy(raw.category || raw.categories),
    verified: Boolean(raw.verified),
    detail: tidy(raw.detail),
    source,
  };
}
function savedProduct(code) { return readList(CATALOG_KEY).find(item => item.barcode === code); }

async function fetchSources(code, onSource) {
  const results = [];
  const local = savedProduct(code);
  onSource('local', local ? 'found' : 'empty', local);
  if (local) results.push(local);
  const checks = [
    (async () => {
      try {
        const res = await fetch(`https://hysmarcos.github.io/superprecios-claros/v1/sku/${encodeURIComponent(code)}/NACIONAL.json`, { signal: AbortSignal.timeout(7000) });
        if (res.status === 404) { onSource('sepa', 'empty'); return; }
        if (!res.ok) throw new Error('SEPA no respondió');
        const json = await res.json();
        if (json.producto?.nombre) {
          const product = json.producto;
          const item = normalizeProduct({
            barcode: json.ean || code,
            name: product.nombre,
            brand: product.marca,
            quantity: [product.cantidad, product.unidad].filter(value => value !== null && value !== undefined && value !== '').join(' '),
            detail: [json.fecha, json.precios?.length ? `${json.precios.length} cadenas` : ''].filter(Boolean).join(' · '),
          }, 'SEPA · Precios Claros');
          results.push(item); onSource('sepa', 'found', item);
        } else onSource('sepa', 'empty');
      } catch { onSource('sepa', 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch(`/api/ez-catalog/lookup?code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('ez-catalog no respondió');
        const json = await res.json();
        if (json.status === 'found' && json.product) {
          const product = json.product;
          const item = normalizeProduct({ barcode: product.barcode || code, name: product.name, brand: product.brand, quantity: product.presentation, image: product.image_url, category: product.category_name || product.subcategory, verified: product.verified, detail: product.verified ? 'Ficha verificada' : '' }, 'ez-catalog');
          results.push(item); onSource('ez', 'found', item);
        } else onSource('ez', json.status || (json.configured === false ? 'not_configured' : 'empty'));
      } catch { onSource('ez', 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch(`https://world.openproductsfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,quantity,image_url,categories`, { signal: AbortSignal.timeout(9000) });
        if (res.status === 404) { onSource('opf', 'empty'); return; }
        if (!res.ok) throw new Error('Sin respuesta');
        const json = await res.json();
        if ((json.status === 'success' || json.status === 1) && json.product) {
          const item = normalizeProduct({ barcode: code, ...json.product }, 'Open Products Facts');
          results.push(item); onSource('opf', 'found', item);
        } else onSource('opf', 'empty');
      } catch (error) { onSource('opf', error?.status === 404 ? 'empty' : 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch('/api/upcitemdb/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ upc: code }), signal: AbortSignal.timeout(10000) });
        if (res.status === 404) { onSource('upc', 'empty'); return; }
        if (!res.ok) throw new Error('Sin respuesta');
        const json = await res.json();
        const product = json.items?.[0];
        if (product) {
          const item = normalizeProduct({ barcode: code, name: product.title, brand: product.brand, quantity: product.size, image: product.images?.[0], category: product.category }, 'UPCitemdb');
          results.push(item); onSource('upc', 'found', item);
        } else onSource('upc', 'empty');
      } catch (error) { onSource('upc', error?.status === 404 ? 'empty' : 'error'); }
    })(),
  ];
  await Promise.all(checks);
  const priority = { 'Mi catálogo': 0, 'SEPA · Precios Claros': 1, 'ez-catalog': 2, 'Open Products Facts': 3, 'UPCitemdb': 4 };
  return results.sort((a, b) => (priority[a.source] ?? 9) - (priority[b.source] ?? 9));
}

function App() {
  const [catalog, setCatalog] = useState(() => readList(CATALOG_KEY));
  const [history, setHistory] = useState(() => readList(HISTORY_KEY));
  const [query, setQuery] = useState('');
  const [activeCode, setActiveCode] = useState('');
  const [sources, setSources] = useState({});
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [form, setForm] = useState({ name: '', brand: '', quantity: '', category: '' });
  const [savedMessage, setSavedMessage] = useState('');
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const stopRef = useRef(null);
  const seenRef = useRef('');

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
    const handler = event => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => { localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog)); }, [catalog]);
  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8))); }, [history]);
  useEffect(() => () => stopCamera(), []);

  const catalogCount = catalog.length;
  const searchedCount = history.length;
  const currentSaved = useMemo(() => activeCode ? catalog.find(item => item.barcode === activeCode) : null, [catalog, activeCode]);

  const lookup = useCallback(async (value) => {
    const code = tidy(value).replace(/\s/g, '');
    if (!/^\d{8,14}$/.test(code)) { setCameraError('Ingresá un código EAN o UPC de 8 a 14 números.'); return; }
    setActiveCode(code); setQuery(code); setBusy(true); setCameraError(''); setSavedMessage(''); setMatches([]);
    setSources({ local: 'loading', sepa: 'loading', ez: 'loading', opf: 'loading', upc: 'loading', gs1: 'manual' });
    setHistory(prev => [{ barcode: code, at: new Date().toISOString() }, ...prev.filter(row => row.barcode !== code)].slice(0, 8));
    setForm({ name: '', brand: '', quantity: '', category: '' });
    const found = await fetchSources(code, (id, status, item) => setSources(prev => ({ ...prev, [id]: status })));
    setMatches(found);
    const best = found.find(item => item.name);
    if (best) setForm({ name: best.name, brand: best.brand, quantity: best.quantity, category: best.category });
    setBusy(false);
  }, []);

  async function startCamera() {
    setCameraError(''); setCameraOn(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Abrí esta página mediante HTTPS para usar la cámara.');
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader(); readerRef.current = reader;
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          const code = result.getText();
          if (seenRef.current !== code) { seenRef.current = code; stopCamera(); lookup(code); }
        }
      });
      stopRef.current = controls;
    } catch (error) {
      setCameraOn(false);
      setCameraError(error?.name === 'NotAllowedError' ? 'Permití el acceso a la cámara en el navegador para escanear.' : (error?.message || 'No se pudo iniciar la cámara.'));
    }
  }
  function stopCamera() {
    try { stopRef.current?.stop(); } catch { }
    try { readerRef.current?.reset(); } catch { }
    if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    stopRef.current = null; setCameraOn(false); seenRef.current = '';
  }
  function saveProduct(event) {
    event.preventDefault();
    if (!activeCode || !form.name.trim()) return;
    const prev = readList(CATALOG_KEY).filter(item => item.barcode !== activeCode);
    const item = { barcode: activeCode, name: tidy(form.name), brand: tidy(form.brand), quantity: tidy(form.quantity), category: tidy(form.category), image: matches.find(m => m.image)?.image || '', source: 'Mi catálogo' };
    const next = [item, ...prev]; setCatalog(next); setMatches([item]); setSavedMessage('Producto guardado en este dispositivo.');
  }
  async function install() { if (!installPrompt) { setShowInstallHelp(true); return; } await installPrompt.prompt(); setInstallPrompt(null); }
  function sourceState(id) {
    const status = sources[id];
    if (status === 'loading') return 'Buscando…';
    if (status === 'found') return 'Encontrado';
    if (status === 'empty') return 'Sin resultado';
    if (status === 'error') return 'No respondió';
    if (status === 'not_configured') return 'Requiere API key';
    if (status === 'auth_error') return 'Revisar API key';
    if (status === 'rate_limited') return 'Límite alcanzado';
    if (status === 'manual') return 'Consulta pública';
    return '—';
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Limpia inicio"><span className="brand-mark"><Sparkles size={18} strokeWidth={2.5}/></span><span>limpia<span className="brand-dot">.</span></span></a>
      <div className="topbar-right"><span className="local-pill"><span className="green-dot"/> Guardado en este dispositivo</span><button className="install-button" onClick={install}>Instalar app</button><button className="icon-button" aria-label="Ayuda" title="La búsqueda en línea necesita conexión"><CircleHelp size={20}/></button></div>
    </header>
    <main className="layout">
      <section className="intro">
        <div className="intro-copy"><div className="kicker"><span className="kicker-icon"><Zap size={14}/></span> CATÁLOGO DE LIMPIEZA</div><h1>Cada producto,<br/><span>en su lugar.</span></h1><p>Escaneá el código para encontrarlo. Si no aparece, lo guardás una vez y queda listo para la próxima.</p>
          <div className="stats"><div><strong>{catalogCount.toString().padStart(2,'0')}</strong><span>productos guardados</span></div><i/><div><strong>{searchedCount.toString().padStart(2,'0')}</strong><span>códigos recientes</span></div></div>
        </div>
        <div className="bottle-art" aria-hidden="true"><span className="sun-disc"/><svg viewBox="0 0 240 270" fill="none"><path d="M91 23h58v17h-8v24l34 31 14 129c2 17-10 31-27 31H78c-17 0-29-14-27-31l14-129 34-31V40h-8V23Z" fill="#B9FF45" stroke="#123A36" strokeWidth="6"/><path d="M74 100h93l9 91H65l9-91Z" fill="#F3F5F0" stroke="#123A36" strokeWidth="5"/><path d="M101 121h39M101 136h39" stroke="#123A36" strokeWidth="5" strokeLinecap="round"/><path d="M96 63h48" stroke="#123A36" strokeWidth="6" strokeLinecap="round"/><path d="M181 54c9 3 14 9 16 18M189 42c15 4 24 14 28 29" stroke="#FF785B" strokeWidth="6" strokeLinecap="round"/></svg><span className="art-caption">LISTO PARA<br/>EL PRÓXIMO ESCANEO</span></div>
      </section>
      <section className="work-area">
        <div className="scan-column">
          <div className="section-heading"><div><span className="step-number">01</span><h2>Escanear producto</h2></div><span className="camera-note"><ShieldCheck size={14}/> La cámara no guarda fotos</span></div>
          <div className={`scanner ${cameraOn ? 'scanner-live' : ''}`}>
            {cameraOn ? <><video ref={videoRef} className="camera-video" muted playsInline/><div className="scan-overlay"><div className="scan-frame"><span/><span/><span/><span/><i/></div><p>Apuntá al código de barras</p></div><button className="camera-close" onClick={stopCamera} aria-label="Cerrar cámara"><X size={18}/></button></> : <div className="camera-placeholder"><div className="scan-icon"><Barcode size={36} strokeWidth={1.65}/><span className="scan-rays"/></div><strong>Escaneá el código del envase</strong><span>Enfocá el código de barras dentro del cuadro</span><button className="primary-button" onClick={startCamera}><Camera size={18}/> Abrir cámara</button></div>}
          </div>
          <div className="manual-search"><span className="or-label">o ingresalo manualmente</span><form onSubmit={event => {event.preventDefault(); lookup(query);}}><Barcode size={19}/><input value={query} onChange={event => setQuery(event.target.value)} inputMode="numeric" placeholder="Ej. 7790001000000" aria-label="Código de barras"/><button type="submit" disabled={busy || !query}><Search size={17}/><span>Buscar</span></button></form></div>
          {cameraError && <div className="notice error-notice">{cameraError}</div>}
          <div className="support-strip"><div className="support-icon"><PackagePlus size={18}/></div><p>Un código nuevo no es un problema. <span>Lo incorporamos al catálogo con una carga rápida.</span></p><ChevronDown size={16}/></div>
        </div>
        <div className="result-column">
          <div className="section-heading result-title"><div><span className="step-number">02</span><h2>Ficha del producto</h2></div><span className="live-indicator"><span/> EN VIVO</span></div>
          <div className="result-card">
            {!activeCode ? <div className="empty-result"><div className="empty-illustration"><Barcode size={27}/><Search size={16}/></div><strong>Acá aparece el producto</strong><p>Escaneá un código para consultar las fuentes disponibles.</p><div className="source-mini"><span>Fuentes automáticas</span><b>SEPA Argentina + bases globales</b></div></div> : <>
              <div className="product-head"><div className="product-icon"><PackagePlus size={22}/></div><div className="product-code"><span>CÓDIGO LEÍDO</span><strong>{activeCode}</strong></div><span className={`lookup-badge ${matches.some(item => item.name) ? 'badge-found' : ''}`}>{busy ? 'Buscando' : matches.some(item => item.name) ? 'Encontrado' : 'Sin ficha'}</span></div>
              {matches.find(item => item.name) && <div className="matched-product">{matches.find(item => item.image) ? <img src={matches.find(item => item.image).image} alt="Producto encontrado"/> : <div className="product-placeholder"><PackagePlus size={26}/></div>}<div><strong>{matches.find(item => item.name).name}</strong><span>{[matches.find(item => item.brand)?.brand, matches.find(item => item.quantity)?.quantity, matches.find(item => item.detail)?.detail].filter(Boolean).join(' · ') || 'Completá los datos que falten'}</span></div><Check size={19}/></div>}
              <div className="sources-list"><div className="sources-header"><span>CONSULTA DE FUENTES</span><span>ESTADO</span></div>{SOURCES.map(source => <div className="source-row" key={source.id}><span className={`source-pip ${source.id}`}/><span className="source-label">{source.label}</span>{source.id === 'gs1' ? <a className="source-action" href={source.url} target="_blank" rel="noreferrer">Consultar <ExternalLink size={13}/></a> : source.id === 'ez' && sources.ez === 'not_configured' ? <a className="source-action" href={source.url} target="_blank" rel="noreferrer">Pedir API key <ExternalLink size={13}/></a> : <span className={`source-status ${sources[source.id] === 'found' ? 'status-green' : ''}`}>{sourceState(source.id)}</span>}</div>)}</div>
              {!currentSaved && <form className="product-form" onSubmit={saveProduct}><div className="form-title"><span>{matches.some(item => item.name) ? 'Guardar en mi catálogo' : 'No encontramos este código'}</span><span>Se guarda en este teléfono</span></div><label>Nombre del producto<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej. Detergente limón"/></label><div className="form-grid"><label>Marca<input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} placeholder="Marca"/></label><label>Contenido<input value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} placeholder="750 ml"/></label></div><button className="save-button" type="submit"><Plus size={17}/>{matches.some(item => item.name) ? 'Guardar producto' : 'Agregar al catálogo'}</button>{savedMessage && <div className="saved-message"><Check size={15}/>{savedMessage}</div>}</form>}
            </>}
          </div>
          <div className="source-footnote"><ShieldCheck size={15}/><span>Las fuentes pueden tener datos incompletos. Confirmá el envase antes de guardar.</span></div>
        </div>
      </section>
      <section className="recent"><div className="recent-heading"><h2><History size={17}/> Escaneos recientes</h2><span>EN ESTE TELÉFONO</span></div>{history.length ? <div className="history-list">{history.slice(0,4).map(row => <button className="history-item" key={row.barcode} onClick={() => lookup(row.barcode)}><Barcode size={18}/><span>{row.barcode}</span><span className="history-name">{catalog.find(item => item.barcode === row.barcode)?.name || 'Buscar de nuevo'}</span><ExternalLink size={14}/></button>)}</div> : <p className="history-empty">Tus últimos códigos aparecerán acá.</p>}</section>
      <footer><span>limpia<span className="brand-dot">.</span> <span className="footer-tagline">Una lista más clara para el día a día.</span></span><span className="connection"><i/> PWA · Catálogo local</span></footer>
    </main>
    {showInstallHelp && <div className="modal-backdrop" onClick={() => setShowInstallHelp(false)}><section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={event => event.stopPropagation()}><button className="dialog-close" onClick={() => setShowInstallHelp(false)} aria-label="Cerrar"><X size={18}/></button><div className="dialog-icon"><Sparkles size={22}/></div><h2 id="install-title">Llevá Limpia al teléfono</h2><p>Instalala desde el navegador para abrirla como una app y tener el catálogo a mano.</p><div className="install-steps"><strong>En iPhone</strong><span>En Safari, tocá <b>Compartir</b> y elegí <b>Agregar a pantalla de inicio</b>.</span><strong>En Android</strong><span>En Chrome, abrí el menú ⋮ y tocá <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</span></div><button className="save-button" onClick={() => setShowInstallHelp(false)}>Entendido</button></section></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
