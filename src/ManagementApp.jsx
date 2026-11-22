import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Globe,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { productBarcodes } from './catalog';
import ThemePicker from './ThemePicker';
import WebOrdersPage, { needsAttention } from './WebOrdersPage';
import './management.css';

const LOW_STOCK = 5;
const money = value => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))}`;
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};
const number = value => new Intl.NumberFormat('es-AR').format(Number(value) || 0);
const emptyProduct = () => ({ barcode: '', name: '', brand: '', category: '', quantity: '', price: '', stock: '0', image: '' });

const SECTIONS = [
  { id: 'home', label: 'Inicio', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos online', icon: Globe },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'movements', label: 'Movimientos', icon: ArrowDownUp },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

function Logo({ small = false }) {
  return <span className={`management-logo ${small ? 'is-small' : ''}`}><img src="/nuevologo.jpg" alt="" /><strong>CR Perfumería</strong></span>;
}

function EntryPanel({ password, setPassword, onSubmit, busy, message, onSales, theme }) {
  return (
    <main className={`management-entry ${theme === 'light' ? 'theme-light' : ''}`}>
      <section className="management-entry-card">
        <Logo />
        <span className="management-eyebrow">Modo gestión</span>
        <h1>Administrá tu local</h1>
        <p>Ingresá la misma clave del local para ver el inventario y sus movimientos.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="management-password">Clave de acceso</label>
          <input id="management-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
          {message && <div className="management-error"><CircleAlert size={16} />{message}</div>}
          <button type="submit" className="management-primary" disabled={busy}>
            {busy ? <><Loader2 size={18} className="management-spin" /> Ingresando…</> : 'Ingresar a gestión'}
          </button>
        </form>
        <button type="button" className="management-return" onClick={onSales}><ShoppingCart size={16} /> Ir al modo venta</button>
      </section>
    </main>
  );
}

function MobileNotice({ theme }) {
  return (
    <main className={`management-mobile ${theme === 'light' ? 'theme-light' : ''}`}>
      <div className="management-mobile-card">
        <Logo />
        <div className="management-mobile-icon"><LayoutDashboard size={30} /></div>
        <h1>Modo gestión</h1>
        <p>Esta sección está preparada para computadoras. En tu dispositivo móvil, iniciá la app en <strong>modo venta</strong>.</p>
        <a href="/" className="management-primary"><ShoppingCart size={18} /> Ir al modo venta</a>
      </div>
    </main>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone = 'gold' }) {
  return (
    <article className={`management-stat ${tone}`}>
      <span className="management-stat-icon"><Icon size={22} /></span>
      <span className="management-stat-copy"><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </article>
  );
}

function Dashboard({ catalog, onSection, onEdit }) {
  const lowStock = useMemo(() => catalog.filter(item => Number(item.stock) <= LOW_STOCK).sort((a, b) => Number(a.stock) - Number(b.stock)).slice(0, 5), [catalog]);
  const lowCount = catalog.filter(item => Number(item.stock) <= LOW_STOCK).length;
  const okPercent = catalog.length ? Math.round(((catalog.length - lowCount) / catalog.length) * 100) : 0;
  const units = catalog.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);

  return (
    <>
      <div className="management-page-heading">
        <div><span className="management-eyebrow">Panel del local</span><h1>Hola, bienvenido</h1><p>Resumen de tu inventario</p></div>
        <div className="management-date"><CalendarDays size={17} />{new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div>
      </div>
      <section className="management-stats">
        <StatCard icon={Boxes} label="Productos registrados" value={number(catalog.length)} detail={`${number(units)} unidades en stock`} />
        <StatCard icon={CheckCircle2} label="Stock en orden" value={`${okPercent}%`} detail={`${number(catalog.length - lowCount)} productos con más de ${LOW_STOCK} unidades`} tone="green" />
        <StatCard icon={AlertTriangle} label="Stock bajo" value={number(lowCount)} detail={lowCount ? 'Necesitan reposición' : 'No hay alertas'} tone={lowCount ? 'warning' : 'green'} />
      </section>
      <section className="management-dashboard-grid">
        <article className="management-panel low-stock-panel">
          <header className="management-panel-heading"><div><span className="management-eyebrow">Atención</span><h2>Stock más bajo</h2></div><button type="button" className="management-link" onClick={() => onSection('products')}>Ver productos <ArrowRight size={16} /></button></header>
          {lowStock.length ? (
            <div className="management-low-list">
              {lowStock.map(item => (
                <button type="button" className="management-low-row" key={item.barcode} onClick={() => onEdit(item)}>
                  <span className="management-product-thumb"><Package size={19} /></span>
                  <span className="management-low-copy"><strong>{item.name}</strong><small>{item.brand || item.barcode}</small></span>
                  <span className={`management-stock-count ${Number(item.stock) === 0 ? 'is-empty' : ''}`}>{number(item.stock)} <small>u.</small></span>
                  <ChevronRight size={17} className="management-muted-icon" />
                </button>
              ))}
            </div>
          ) : <div className="management-inventory-ok"><span><CheckCircle2 size={32} /></span><strong>Todo tu inventario al día</strong><small>Los productos tienen stock suficiente.</small></div>}
        </article>
        <article className="management-panel management-side-card">
          <div className="management-side-icon"><Store size={31} /></div>
          <span className="management-eyebrow">Tu negocio</span>
          <h2>Inventario al día</h2>
          <p>Los cambios se guardan y se reflejan también en el modo venta.</p>
          <button type="button" className="management-secondary" onClick={() => onSection('products')}><Package size={17} /> Gestionar productos</button>
        </article>
      </section>
    </>
  );
}

function ProductsPage({ catalog, onEdit, onAdd, onDelete, deletingBarcode }) {
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(() => {
    const query = term.trim().toLocaleLowerCase('es');
    return [...catalog].filter(item => {
      const matchesText = !query || [item.name, item.brand, item.category, ...productBarcodes(item)].some(value => String(value || '').toLocaleLowerCase('es').includes(query));
      const stock = Number(item.stock) || 0;
      const matchesStock = filter === 'all' || (filter === 'low' ? stock > 0 && stock <= LOW_STOCK : stock === 0);
      return matchesText && matchesStock;
    }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }, [catalog, filter, term]);

  return (
    <>
      <div className="management-page-heading products-heading">
        <div><span className="management-eyebrow">Inventario del local</span><h1>Productos</h1><p>Consultá y actualizá precios y stock.</p></div>
        <button type="button" className="management-primary add-product-button" onClick={onAdd}><Plus size={18} /> Nuevo producto</button>
      </div>
      <section className="management-panel management-products-panel">
        <div className="management-products-toolbar">
          <label className="management-search"><Search size={18} /><input value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar por nombre, marca o código de barras" /></label>
          <div className="management-filters" aria-label="Filtrar productos">
            <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
            <button type="button" className={filter === 'low' ? 'active' : ''} onClick={() => setFilter('low')}>Stock bajo</button>
            <button type="button" className={filter === 'empty' ? 'active' : ''} onClick={() => setFilter('empty')}>Sin stock</button>
          </div>
        </div>
        <div className="management-table-wrap">
          <table className="management-table">
            <thead><tr><th>Producto</th><th>Código de barras</th><th>Precio</th><th>Stock</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {filtered.map(item => {
                const stock = Number(item.stock) || 0;
                return (
                  <tr key={item.barcode}>
                    <td><span className="management-table-product"><span className="management-product-thumb">{item.image ? <img src={item.image} alt="" /> : <Package size={18} />}</span><span><strong>{item.name}</strong><small>{[item.brand, item.quantity].filter(Boolean).join(' · ') || item.category || 'Sin detalle'}</small></span></span></td>
                    <td className="management-code">{item.barcode}</td>
                    <td className="management-price">{money(item.price)}</td>
                    <td>{number(stock)} u.</td>
                    <td><span className={`management-status ${stock === 0 ? 'empty' : stock <= LOW_STOCK ? 'low' : 'ok'}`}><i />{stock === 0 ? 'Sin stock' : stock <= LOW_STOCK ? 'Stock bajo' : 'En orden'}</span></td>
                    <td><div className="management-row-actions"><button type="button" className="management-icon-button" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}><Pencil size={16} /></button><button type="button" className="management-icon-button delete" onClick={() => onDelete(item)} disabled={Boolean(deletingBarcode)} aria-label={`Eliminar ${item.name}`}>{deletingBarcode === item.barcode ? <Loader2 size={16} className="management-spin" /> : <Trash2 size={16} />}</button></div></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="6"><div className="management-empty"><Search size={24} /><strong>No encontramos productos</strong><span>Probá otra búsqueda o agregá uno nuevo.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="management-table-footer">{number(filtered.length)} de {number(catalog.length)} productos</footer>
      </section>
    </>
  );
}

function MovementsPage({ movements, loading, stockTrackingAvailable }) {
  const [openId, setOpenId] = useState('');
  return (
    <>
      <div className="management-page-heading"><div><span className="management-eyebrow">Actividad del local</span><h1>Movimientos</h1><p>Ingresos de stock y compras finalizadas.</p></div></div>
      <section className="management-panel management-movements-panel">
        <header className="management-panel-heading"><div><span className="management-eyebrow">Historial</span><h2>Actividad reciente</h2></div><span className="management-count-pill">{number(movements.length)} registros</span></header>
        {stockTrackingAvailable === false && <div className="management-movement-setup">El historial de ingresos de stock todavía no está activo. Contactá al soporte para habilitarlo.</div>}
        {loading ? <div className="management-loading-inline"><Loader2 size={19} className="management-spin" /> Cargando movimientos…</div> : movements.length ? (
          <div className="management-movement-list">
            {movements.map(movement => {
              const open = openId === movement.id;
              const isPurchase = movement.kind === 'purchase';
              const units = isPurchase ? movement.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : movement.quantityAdded;
              return (
                <article className={`management-movement ${open ? 'is-open' : ''}`} key={movement.id}>
                  <button type="button" className="management-movement-summary" onClick={() => setOpenId(open ? '' : movement.id)} aria-expanded={open}>
                    <span className={`management-movement-icon ${isPurchase ? '' : 'stock'}`}>{isPurchase ? <ShoppingCart size={18} /> : <PackagePlus size={18} />}</span>
                    <span className="management-movement-copy"><strong>{isPurchase ? `Compra · ${money(movement.total)}` : `Stock ingresado · ${movement.name}`}</strong><small>{dateTime(movement.at)} · {isPurchase ? `${number(units)} unidades` : `+${number(units)} unidades · stock actual ${number(movement.newStock)}`}</small></span>
                    <span className="management-movement-total">{isPurchase ? money(movement.total) : `+${number(units)} u.`}</span>
                    <ChevronRight size={18} className="management-movement-chevron" />
                  </button>
                  {open && (isPurchase
                    ? <div className="management-movement-detail">{movement.items.map((item, index) => <div className="management-movement-line" key={`${item.barcode}-${index}`}><span>{item.name} <small>×{item.qty}</small></span><strong>{money(Number(item.price) * Number(item.qty))}</strong></div>)}</div>
                    : <div className="management-movement-detail"><div className="management-movement-line"><span>{movement.name} <small>Código {movement.barcode}</small></span><strong>Stock {number(movement.previousStock)} → {number(movement.newStock)}</strong></div></div>)}
                </article>
              );
            })}
          </div>
        ) : <div className="management-empty"><ArrowDownUp size={24} /><strong>Todavía no hay movimientos</strong><span>Los ingresos de stock y las compras finalizadas aparecerán acá.</span></div>}
      </section>
    </>
  );
}

function SettingsPage({ onSales, onLogout, theme, onThemeChange }) {
  return (
    <>
      <div className="management-page-heading"><div><span className="management-eyebrow">Preferencias</span><h1>Configuración</h1><p>Acceso y preferencias de CR Perfumería.</p></div></div>
      <section className="management-settings-grid">
        <article className="management-panel management-settings-card">
          <span className="management-settings-icon"><Sun size={21} /></span><span className="management-eyebrow">Apariencia</span>
          <h2>Modo claro u oscuro</h2><p>Elegí el aspecto visual para los modos venta y gestión.</p>
          <ThemePicker theme={theme} onChange={onThemeChange} />
        </article>
        <article className="management-panel management-settings-card">
          <span className="management-settings-icon"><Store size={21} /></span><span className="management-eyebrow">Datos del local</span>
          <h2>Datos del local</h2><p>El inventario, los precios y los movimientos se comparten con el modo venta.</p>
          <span className="management-connection"><i /> Datos al día</span>
        </article>
        <article className="management-panel management-settings-card">
          <span className="management-settings-icon"><SlidersHorizontal size={21} /></span><span className="management-eyebrow">Modos de uso</span>
          <h2>Elegí dónde continuar</h2><p>El modo venta está pensado para el mostrador. Gestión está preparado para trabajar desde una computadora.</p>
          <button type="button" className="management-secondary" onClick={onSales}><ShoppingCart size={17} /> Volver al modo venta</button>
        </article>
        <article className="management-panel management-settings-card danger-settings-card">
          <span className="management-settings-icon"><LogOut size={21} /></span><span className="management-eyebrow">Sesión</span>
          <h2>Cerrar sesión</h2><p>Vas a volver a la pantalla para elegir entre modo venta y modo gestión. La clave es la misma en ambos.</p>
          <button type="button" className="management-logout-button" onClick={onLogout}><LogOut size={17} /> Cerrar sesión</button>
        </article>
      </section>
    </>
  );
}

function ProductEditor({ product, busy, error, onClose, onSave, setError }) {
  const [form, setForm] = useState(() => product ? {
    barcode: product.barcode || '', name: product.name || '', brand: product.brand || '', category: product.category || '', quantity: product.quantity || '', price: String(product.price ?? 0), stock: String(product.stock ?? 0), image: product.image || '',
  } : emptyProduct());
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const submit = event => {
    event.preventDefault();
    setError('');
    onSave(form);
  };

  return (
    <div className="management-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="management-editor" role="dialog" aria-modal="true" aria-labelledby="management-editor-title">
        <header><div><span className="management-eyebrow">Inventario</span><h2 id="management-editor-title">{product ? 'Editar producto' : 'Nuevo producto'}</h2></div><button type="button" className="management-icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></header>
        <form onSubmit={submit}>
          <div className="management-form-grid">
            <label className="management-field full"><span>Código de barras</span><input value={form.barcode} onChange={event => set('barcode', event.target.value.replace(/\D/g, ''))} inputMode="numeric" minLength="8" maxLength="14" pattern="[0-9]{8,14}" required disabled={Boolean(product)} /></label>
            <label className="management-field full"><span>Nombre</span><input value={form.name} onChange={event => set('name', event.target.value)} maxLength="180" required /></label>
            <label className="management-field"><span>Marca</span><input value={form.brand} onChange={event => set('brand', event.target.value)} maxLength="100" /></label>
            <label className="management-field"><span>Categoría</span><input value={form.category} onChange={event => set('category', event.target.value)} maxLength="100" /></label>
            <label className="management-field"><span>Contenido</span><input value={form.quantity} onChange={event => set('quantity', event.target.value)} maxLength="80" placeholder="Ej. 500 ml" /></label>
            <label className="management-field"><span>Precio</span><input type="number" min="0" step="0.01" value={form.price} onChange={event => set('price', event.target.value)} required /></label>
            <label className="management-field"><span>Stock</span><input type="number" min="0" step="1" value={form.stock} onChange={event => set('stock', event.target.value)} required /></label>
            <label className="management-field full"><span>Imagen (opcional)</span><input type="url" value={form.image} onChange={event => set('image', event.target.value)} placeholder="https://…" /></label>
          </div>
          {error && <div className="management-error"><CircleAlert size={16} />{error}</div>}
          <footer><button type="button" className="management-cancel" onClick={onClose}>Cancelar</button><button type="submit" className="management-primary" disabled={busy}>{busy ? <><Loader2 size={17} className="management-spin" /> Guardando…</> : 'Guardar producto'}</button></footer>
        </form>
      </section>
    </div>
  );
}

function ManagementShell({ catalog, section, setSection, movements, loadingMovements, stockTrackingAvailable, onAdd, onEdit, onDelete, deletingBarcode, onSales, onLogout, theme, onThemeChange, webOrders }) {
  const attentionCount = (webOrders.data?.orders || []).filter(needsAttention).length;
  const newCount = (webOrders.data?.orders || []).filter(order => order.order_status === 'pending_review').length;
  const active = SECTIONS.find(item => item.id === section) || SECTIONS[0];
  const ActiveIcon = active.icon;
  return (
    <div className={`management-app ${theme === 'light' ? 'theme-light' : ''}`}>
      <aside className="management-sidebar">
        <a href="/gestion" className="management-brand-link" onClick={event => { event.preventDefault(); setSection('home'); }}><Logo /></a>
        <div className="management-sidebar-label">LOCAL</div>
        <nav className="management-sidebar-nav" aria-label="Secciones de gestión">
          {SECTIONS.map(item => {
            const Icon = item.icon;
            const selected = section === item.id;
            const badge = item.id === 'orders' && attentionCount > 0 ? <b className={`management-nav-badge ${newCount ? 'is-new' : ''}`}>{attentionCount}</b> : null;
            return <button type="button" key={item.id} className={`management-nav-item ${selected ? 'active' : ''}`} onClick={() => setSection(item.id)} aria-current={selected ? 'page' : undefined}><Icon size={19} /><span>{item.label}</span>{badge}{selected && !badge && <i />}</button>;
          })}
        </nav>
        <div className="management-sidebar-bottom">
          <button type="button" className="management-mode-switch" onClick={onSales}><ShoppingCart size={18} /><span><strong>Modo venta</strong><small>Volver al mostrador</small></span><ArrowRight size={16} /></button>
          <button type="button" className="management-sidebar-logout" onClick={onLogout}><LogOut size={17} /> Cerrar sesión</button>
          <div className="management-sidebar-foot"><span className="management-user-avatar">CR</span><span><strong>CR Perfumería</strong><small>Acceso compartido</small></span></div>
        </div>
      </aside>

      <main className="management-workspace">
        <header className="management-topbar">
          <div className="management-crumb"><ActiveIcon size={17} /><span>Gestión</span><ChevronRight size={15} /><strong>{active.label}</strong></div>
          <div className="management-topbar-right">{newCount > 0 && <button type="button" className="management-topbar-orders" onClick={() => setSection('orders')}><Bell size={15} /> {newCount === 1 ? '1 pedido nuevo' : `${newCount} pedidos nuevos`}</button>}<span className="management-status-dot" /> <span>Datos al día</span><span className="management-topbar-divider" /><span className="management-topbar-avatar">CR</span></div>
        </header>
        <div className="management-content">
          {section === 'orders' && <WebOrdersPage data={webOrders.data} loading={webOrders.loading} error={webOrders.error} onRefresh={webOrders.refresh} onAction={webOrders.act} working={webOrders.working} notificationsEnabled={webOrders.notificationsEnabled} onEnableNotifications={webOrders.enableNotifications} />}
          {section === 'home' && <Dashboard catalog={catalog} onSection={setSection} onEdit={onEdit} />}
          {section === 'products' && <ProductsPage catalog={catalog} onEdit={onEdit} onAdd={onAdd} onDelete={onDelete} deletingBarcode={deletingBarcode} />}
          {section === 'movements' && <MovementsPage movements={movements} loading={loadingMovements} stockTrackingAvailable={stockTrackingAvailable} />}
          {section === 'settings' && <SettingsPage onSales={onSales} onLogout={onLogout} theme={theme} onThemeChange={onThemeChange} />}
        </div>
      </main>
    </div>
  );
}

export default function ManagementApp({ theme = 'dark', onThemeChange = () => {}, onSales = () => {}, onExit = () => {} }) {
  const mobile = typeof navigator !== 'undefined' && (navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(max-width: 760px)').matches);
  const [status, setStatus] = useState(mobile ? 'mobile' : 'loading');
  const [catalog, setCatalog] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [stockTrackingAvailable, setStockTrackingAvailable] = useState(null);
  const [section, setSection] = useState('home');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editorProduct, setEditorProduct] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingBarcode, setDeletingBarcode] = useState('');
  const [editorError, setEditorError] = useState('');
  const [toast, setToast] = useState('');
  const [webData, setWebData] = useState(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [webWorking, setWebWorking] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => (typeof Notification === 'undefined' ? null : Notification.permission === 'granted'));
  const knownPending = useRef(null);

  const applyState = useCallback(data => {
    setCatalog(data.catalog || []);
    setStatus('ready');
    setMessage('');
  }, []);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, cache: 'no-store' });
    let payload = {};
    try { payload = await response.json(); } catch { }
    if (response.status === 401) {
      setCatalog([]);
      setMovements([]);
      setStockTrackingAvailable(null);
      setStatus('locked');
      setMessage('La sesión terminó. Ingresá la clave del local de nuevo.');
    }
    if (!response.ok) throw Object.assign(new Error(payload.error || 'No se pudo completar la operación.'), { status: response.status });
    return payload;
  }, []);

  useEffect(() => {
    document.title = 'CR Perfumería · Gestión';
    if (mobile) return undefined;
    let active = true;
    request('/api/shop/state')
      .then(data => { if (active) applyState(data); })
      .catch(error => {
        if (!active) return;
        setStatus('locked');
        if (error.status !== 401) setMessage(error.message || 'No se pudieron cargar los datos del local.');
      });
    return () => { active = false; };
  }, [applyState, mobile, request]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const timer = window.setInterval(async () => {
      try { await request('/api/shop/session'); } catch { }
    }, 30_000);
    const checkVisible = () => { if (document.visibilityState === 'visible') void request('/api/shop/session').catch(() => {}); };
    document.addEventListener('visibilitychange', checkVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', checkVisible); };
  }, [request, status]);

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!active || status !== 'ready' || document.visibilityState !== 'visible' || pending) return;
      pending = true;
      try {
        const [state, activity] = await Promise.all([request('/api/shop/state'), request('/api/shop/movements')]);
        if (active) {
          setCatalog(state.catalog || []);
          setMovements(activity.movements || []);
          setStockTrackingAvailable(activity.stockTrackingAvailable);
          setLoadingMovements(false);
        }
      } catch { }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [request, status]);

  // Online orders: one small query every 30 s while gestión is open and visible.
  // A new cash order (or a newly paid one) shows a toast, a short sound, a browser notification and a counter in the tab title.
  const loadWebOrders = useCallback(async () => {
    setWebLoading(true);
    try {
      const data = await request('/api/shop/web-orders');
      setWebData(data);
      setWebError('');
      const pending = (data.orders || []).filter(needsAttention).map(order => order.id);
      if (knownPending.current) {
        const fresh = (data.orders || []).filter(order => needsAttention(order) && !knownPending.current.has(order.id));
        if (fresh.length) {
          const text = fresh.length === 1 ? `Nuevo pedido online: ${fresh[0].order_number}` : `${fresh.length} pedidos online nuevos`;
          setToast(text);
          window.setTimeout(() => setToast(''), 6000);
          try {
            const audio = new (window.AudioContext || window.webkitAudioContext)();
            const tone = audio.createOscillator(); const gain = audio.createGain();
            tone.frequency.value = 880; gain.gain.setValueAtTime(.12, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .6);
            tone.connect(gain).connect(audio.destination); tone.start(); tone.stop(audio.currentTime + .6);
          } catch { }
          try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('CR Perfumería', { body: text, icon: '/nuevologo.jpg' }); } catch { }
        }
      }
      knownPending.current = new Set(pending);
    } catch (error) {
      if (error.status !== 401) setWebError(error.message || 'No se pudieron cargar los pedidos online.');
    } finally { setWebLoading(false); }
  }, [request]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    void loadWebOrders();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadWebOrders(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadWebOrders, status]);

  useEffect(() => {
    const count = (webData?.orders || []).filter(order => order.order_status === 'pending_review').length;
    document.title = count ? `(${count}) CR Perfumería · Gestión` : 'CR Perfumería · Gestión';
  }, [webData]);

  const webOrderAction = async (order, action) => {
    if (action === 'reject' && !window.confirm(`¿${order.order_status === 'pending_review' ? 'Rechazar' : 'Cancelar'} el pedido ${order.order_number}?\n\nEl stock reservado vuelve al inventario.`)) return;
    setWebWorking(`${order.id}:${action}`);
    try {
      await request('/api/shop/web-orders', { method: 'POST', body: JSON.stringify({ orderId: order.id, action }) });
      await loadWebOrders();
      const done = { accept: 'Pedido aceptado.', ready: 'Pedido marcado como listo para retirar.', deliver: 'Pedido entregado.', reject: 'Pedido cancelado y stock devuelto.' }[action];
      setToast(done); window.setTimeout(() => setToast(''), 3200);
    } catch (error) {
      setToast(error.message || 'No se pudo actualizar el pedido.'); window.setTimeout(() => setToast(''), 4200);
    } finally { setWebWorking(''); }
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    try { setNotificationsEnabled((await Notification.requestPermission()) === 'granted'); } catch { }
  };

  const login = async event => {
    event.preventDefault();
    if (!password.trim()) { setMessage('Ingresá la clave de acceso del local.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/shop/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), cache: 'no-store' });
      let data = {};
      try { data = await response.json(); } catch { }
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
      setPassword('');
      applyState(data);
    } catch (error) { setMessage(error.message || 'No se pudo conectar con los datos del local.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await fetch('/api/shop/session', { method: 'DELETE', cache: 'no-store' }); } catch { }
    onExit();
  };

  const openEditor = product => {
    setEditorProduct(product || null);
    setEditorError('');
    setEditorOpen(true);
  };

  const saveProduct = async form => {
    setSavingProduct(true);
    setEditorError('');
    try {
      const { product } = await request('/api/shop/products', { method: 'POST', body: JSON.stringify({ ...form, price: Number(form.price), stock: Number(form.stock), barcodes: editorProduct?.barcodes || [form.barcode] }) });
      setCatalog(previous => [...previous.filter(item => item.barcode !== product.barcode), product].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')));
      setEditorOpen(false);
      setToast('Producto guardado.');
      window.setTimeout(() => setToast(''), 3200);
    } catch (error) { setEditorError(error.message || 'No se pudo guardar el producto.'); }
    finally { setSavingProduct(false); }
  };

  const deleteProduct = async product => {
    const confirmed = window.confirm(`¿Eliminar “${product.name}” del inventario?\n\nSe borrará el producto. Las compras ya registradas se conservan.`);
    if (!confirmed) return;
    setDeletingBarcode(product.barcode);
    try {
      const result = await request(`/api/shop/products?barcode=${encodeURIComponent(product.barcode)}`, { method: 'DELETE' });
      if (result.barcode !== product.barcode) throw new Error('No se pudo confirmar la eliminación. Actualizá la lista y volvé a intentar.');
      setCatalog(previous => previous.filter(item => item.barcode !== product.barcode));
      setToast('Producto eliminado del inventario.');
      window.setTimeout(() => setToast(''), 3200);
    } catch (error) {
      setToast(error.message || 'No se pudo eliminar el producto.');
      window.setTimeout(() => setToast(''), 4200);
    } finally { setDeletingBarcode(''); }
  };

  if (mobile) return <MobileNotice theme={theme} />;
  if (status === 'loading') return <main className={`management-loading ${theme === 'light' ? 'theme-light' : ''}`}><Logo /><span className="management-loader-ring"><Loader2 size={30} className="management-spin" /></span><p>Conectando con los datos del local…</p></main>;
  if (status !== 'ready') return <EntryPanel password={password} setPassword={setPassword} onSubmit={login} busy={busy} message={message} onSales={onSales} theme={theme} />;

  return (
    <>
      <ManagementShell webOrders={{ data: webData, loading: webLoading, error: webError, refresh: loadWebOrders, act: webOrderAction, working: webWorking, notificationsEnabled, enableNotifications }} catalog={catalog} section={section} setSection={setSection} movements={movements} loadingMovements={loadingMovements} stockTrackingAvailable={stockTrackingAvailable} onAdd={() => openEditor(null)} onEdit={openEditor} onDelete={deleteProduct} deletingBarcode={deletingBarcode} onSales={onSales} onLogout={logout} theme={theme} onThemeChange={onThemeChange} />
      {editorOpen && <ProductEditor key={editorProduct?.barcode || 'new-product'} product={editorProduct} busy={savingProduct} error={editorError} setError={setEditorError} onClose={() => setEditorOpen(false)} onSave={saveProduct} />}
      {toast && <div className="management-toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
    </>
  );
}
