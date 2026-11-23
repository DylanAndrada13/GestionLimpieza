import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, ImageOff, ImagePlus, Loader2, Package, Search, Trash2 } from 'lucide-react';
import { productBarcodes } from './catalog';

const PAGE = 40;
const hasPhoto = item => /^https?:\/\//i.test(String(item.image || ''));

function PhotoRow({ item, open, onOpen, onSave, saving }) {
  const [url, setUrl] = useState(item.image || '');
  const [preview, setPreview] = useState('idle');
  useEffect(() => { setUrl(item.image || ''); setPreview('idle'); }, [item.image, open]);
  const clean = url.trim();
  const valid = /^https:\/\/\S+$/i.test(clean);
  const google = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent([item.name, item.brand].filter(Boolean).join(' '))}`;

  return (
    <li className={`mg-photo-row ${open ? 'is-open' : ''}`}>
      <button type="button" className="mg-photo-summary" onClick={onOpen} aria-expanded={open}>
        <span className="mg-thumb mg-photo-thumb">{hasPhoto(item) ? <img src={item.image} alt="" loading="lazy" /> : <ImageOff size={18} />}</span>
        <span className="mg-low-copy"><strong>{item.name}</strong><small>{[item.brand, item.barcode].filter(Boolean).join(' · ')}</small></span>
        {!(Number(item.price) > 0) && <span className="mg-stock is-empty">Sin precio</span>}
        <span className={`mg-stock ${hasPhoto(item) ? 'is-ok' : 'is-low'}`}>{hasPhoto(item) ? 'Con foto' : 'Sin foto'}</span>
        <span className="mg-btn ghost mg-photo-cta"><ImagePlus size={16} /> {hasPhoto(item) ? 'Cambiar foto' : 'Poner foto'}</span>
      </button>
      {open && (
        <form className="mg-photo-form" onSubmit={event => { event.preventDefault(); if (valid) onSave(item, clean); }}>
          <div className="mg-photo-preview">
            {valid && preview !== 'error'
              ? <img src={clean} alt={`Vista previa de ${item.name}`} onLoad={() => setPreview('ok')} onError={() => setPreview('error')} />
              : <span>{preview === 'error' ? <><AlertTriangle size={20} /> Esa dirección no muestra una imagen</> : <><Package size={22} /> Acá vas a ver la foto antes de guardarla</>}</span>}
          </div>
          <div className="mg-photo-fields">
            <label className="mg-field">
              <span>Dirección de la foto (empieza con https://)</span>
              <input value={url} onChange={event => { setUrl(event.target.value); setPreview('idle'); }} placeholder="https://…" inputMode="url" autoFocus />
            </label>
            <a className="mg-link" href={google} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Buscar fotos de este producto en Google</a>
            <div className="mg-photo-actions">
              {hasPhoto(item) && <button type="button" className="mg-btn danger-ghost" disabled={saving} onClick={() => onSave(item, '')}><Trash2 size={16} /> Quitar foto</button>}
              <button type="submit" className="mg-btn primary" disabled={!valid || preview === 'error' || saving || clean === item.image}>{saving ? <Loader2 size={16} className="mg-spin" /> : <CheckCircle2 size={16} />} Guardar foto</button>
            </div>
          </div>
        </form>
      )}
    </li>
  );
}

export default function PhotosPage({ catalog, onSaveImage, savingBarcode }) {
  const [filter, setFilter] = useState('missing');
  const [term, setTerm] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [openBarcode, setOpenBarcode] = useState('');
  useEffect(() => { setLimit(PAGE); }, [filter, term]);
  const missing = useMemo(() => catalog.filter(item => !hasPhoto(item)).length, [catalog]);
  const list = useMemo(() => {
    const query = term.trim().toLocaleLowerCase('es');
    return catalog
      .filter(item => (filter === 'all' || !hasPhoto(item)) && (!query || [item.name, item.brand, ...productBarcodes(item)].some(value => String(value || '').toLocaleLowerCase('es').includes(query))))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }, [catalog, filter, term]);

  const save = async (item, url) => {
    const ok = await onSaveImage(item, url);
    if (ok) setOpenBarcode('');
  };

  return (
    <div className="mg-page">
      <div className="mg-page-head">
        <div>
          <h1>Poner foto</h1>
          <p>Esta sección sirve para ponerle una foto a cada producto. La tienda online solo muestra los productos que tienen foto y precio: los que no tienen foto, los clientes no los ven hasta que les pongas una.</p>
        </div>
      </div>

      <section className="mg-panel mg-photo-help" aria-label="Cómo poner una foto">
        <h2>Cómo hacerlo</h2>
        <ol>
          <li>Tocá <strong>Poner foto</strong> en el producto.</li>
          <li>Tocá <strong>Buscar fotos de este producto en Google</strong>, o buscala en la página de la marca.</li>
          <li>Abrí la foto, hacé clic derecho sobre ella y elegí <strong>Copiar dirección de imagen</strong>.</li>
          <li>Pegala en el casillero. Si la vista previa se ve bien, tocá <strong>Guardar foto</strong>. Aparece en la tienda en un par de minutos.</li>
        </ol>
      </section>

      <div className="mg-toolbar">
        <div className="mg-tabs" role="tablist" aria-label="Filtrar productos">
          <button type="button" role="tab" aria-selected={filter === 'missing'} className={filter === 'missing' ? 'is-active' : ''} onClick={() => setFilter('missing')}>Sin foto{missing ? <b>{missing}</b> : null}</button>
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>Todos</button>
        </div>
        <label className="mg-search"><Search size={16} /><input value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar por nombre, marca o código" aria-label="Buscar productos" /></label>
      </div>

      <section className="mg-panel">
        {list.length ? (
          <ul className="mg-photo-list">
            {list.slice(0, limit).map(item => (
              <PhotoRow key={item.barcode} item={item} open={openBarcode === item.barcode} onOpen={() => setOpenBarcode(openBarcode === item.barcode ? '' : item.barcode)} onSave={save} saving={savingBarcode === item.barcode} />
            ))}
          </ul>
        ) : <p className="mg-empty-inline"><CheckCircle2 size={18} /> {filter === 'missing' && !term ? 'Todos los productos tienen foto.' : 'No hay productos con esa búsqueda.'}</p>}
        {list.length > limit && <footer className="mg-table-foot"><span>{limit} de {list.length}</span><button type="button" className="mg-btn ghost" onClick={() => setLimit(value => value + PAGE)}>Mostrar más</button></footer>}
      </section>
    </div>
  );
}
