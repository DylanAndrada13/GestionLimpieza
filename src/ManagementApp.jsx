import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Home,
  ImagePlus,
  Loader2,
  LogOut,
  Moon,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { productBarcodes } from './catalog';
import ThemePicker from './ThemePicker';
import PhotosPage from './PhotosPage';
import WebOrdersPage, { ORDER_LABEL, needsAttention, statusKey, timeAgo } from './WebOrdersPage';
import './management.css';

const LOW_STOCK = 5;
const PAGE_SIZE = 120;
// Supabase free plan: the inventory is checked with a tiny query every minute and downloaded
// again only when it changed. Online orders, one light query every 30 s (60 s with the tab hidden).
const VERSION_CHECK_MS = 60_000;
const FULL_RELOAD_MS = 10 * 60_000;
const ORDERS_VISIBLE_MS = 30_000;
const ORDERS_HIDDEN_MS = 60_000;

const money = value => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))}`;
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};
const number = value => new Intl.NumberFormat('es-AR').format(Number(value) || 0);
const emptyProduct = () => ({ barcode: '', name: '', brand: '', category: '', quantity: '', price: '', stock: '0', image: '' });
const isToday = value => new Date(value).toDateString() === new Date().toDateString();

const NAV = [
  { group: 'Hoy', items: [
    { id: 'home', label: 'Resumen', icon: Home },
    { id: 'orders', label: 'Pedidos online', icon: ShoppingBag },
  ] },
  { group: 'Inventario', items: [
    { id: 'products', label: 'Productos', icon: Package },
    { id: 'photos', label: 'Poner foto', icon: ImagePlus },
    { id: 'movements', label: 'Movimientos', icon: ArrowDownUp },
  ] },
  { group: 'Local', items: [
    { id: 'settings', label: 'Configuración', icon: Settings },
  ] },
];
const SECTION_IDS = ['home', 'orders', 'products', 'photos', 'movements', 'settings'];
const HASH = { home: '', orders: 'pedidos', products: 'productos', photos: 'fotos', movements: 'movimientos', settings: 'configuracion' };
const sectionFromHash = () => {
  const hash = window.location.hash.replace('#', '');
  return SECTION_IDS.find(id => HASH[id] === hash && hash) || 'home';
};

function Logo() {
  return <span className="mg-logo"><img src="/nuevologo.jpg" alt="" /><span><strong>CR Perfumería</strong><small>Gestión del local</small></span></span>;
}

function EntryPanel({ password, setPassword, onSubmit, busy, message, onSales, theme }) {
  return (
    <main className={`mg-screen ${theme === 'light' ? 'is-light' : ''}`}>
      <section className="mg-entry">
        <Logo />
        <h1>Entrá a gestión</h1>
        <p>Usá la misma clave del local que en el modo venta.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="mg-password">Clave del local</label>
          <input id="mg-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required autoFocus />
          {message && <div className="mg-notice tone-danger"><CircleAlert size={16} />{message}</div>}
          <button type="submit" className="mg-btn primary wide" disabled={busy}>{busy ? <><Loader2 size={17} className="mg-spin" /> Entrando…</> : 'Entrar'}</button>
        </form>
        <button type="button" className="mg-btn ghost wide" onClick={onSales}><ShoppingCart size={16} /> Ir al modo venta</button>
      </section>
    </main>
  );
}

function MobileNotice({ theme }) {
  return (
    <main className={`mg-screen ${theme === 'light' ? 'is-light' : ''}`}>
      <section className="mg-entry">
        <Logo />
        <h1>Gestión se usa en la computadora</h1>
        <p>En el teléfono, abrí el <strong>modo venta</strong> para escanear y cobrar en el mostrador.</p>
        <a href="/" className="mg-btn primary wide"><ShoppingCart size={17} /> Ir al modo venta</a>
      </section>
    </main>
  );
}

function Dashboard({ catalog, orders, onSection, onOpenOrder, onEdit }) {
  const lowStock = useMemo(() => catalog.filter(item => Number(item.stock) <= LOW_STOCK).sort((a, b) => Number(a.stock) - Number(b.stock)), [catalog]);
  const units = catalog.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const empty = catalog.filter(item => Number(item.stock) === 0).length;
  const attention = orders.filter(needsAttention).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const fresh = attention.filter(order => order.order_status === 'pending_review').length;
  const today = orders.filter(order => isToday(order.created_at) && order.order_status !== 'cancelled');
  const paidToday = orders.filter(order => order.payment_status === 'paid' && order.paid_at && isToday(order.paid_at)).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const cashPending = orders.filter(order => order.payment_method === 'efectivo' && order.payment_status === 'pending' && !['cancelled', 'delivered'].includes(order.order_status)).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const hour = new Date().getHours();

  return (
    <div className="mg-page">
      <div className="mg-page-head">
        <div>
          <h1>{hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'}</h1>
          <p className="mg-date">{new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        </div>
      </div>

      <section className={`mg-hero-orders ${fresh ? 'has-new' : ''}`} aria-labelledby="mg-attend-title">
        <div className="mg-hero-orders-count">
          <strong>{attention.length}</strong>
          <span id="mg-attend-title">{attention.length === 1 ? 'pedido online para atender' : 'pedidos online para atender'}</span>
          {fresh > 0 && <em><BellRing size={15} /> {fresh === 1 ? '1 nuevo sin aceptar' : `${fresh} nuevos sin aceptar`}</em>}
        </div>
        <ul className="mg-hero-orders-list">
          {attention.slice(0, 4).map(order => (
            <li key={order.id}>
              <button type="button" onClick={() => onOpenOrder(order.id)}>
                <span className={`mg-dot tone-${order.order_status === 'pending_review' || order.order_status === 'confirmed' ? 'new' : order.order_status === 'ready_for_pickup' ? 'ready' : 'work'}`} />
                <span className="mg-hero-order-copy"><strong>{order.customer_name}</strong><small>{ORDER_LABEL[statusKey(order)]} · {order.pickup_point} · {timeAgo(order.created_at)}</small></span>
                <b>{money(order.total_amount)}</b>
                <ChevronRight size={16} />
              </button>
            </li>
          ))}
          {!attention.length && <li className="mg-hero-orders-empty">Todo atendido. Cuando entre un pedido, suena un aviso y aparece acá.</li>}
        </ul>
        <button type="button" className="mg-btn ghost" onClick={() => onSection('orders')}>Ver todos los pedidos</button>
      </section>

      <section className="mg-figures" aria-label="Números de hoy">
        <div><span>Pedidos online hoy</span><strong>{number(today.length)}</strong></div>
        <div><span>Cobrado online hoy</span><strong>{money(paidToday)}</strong></div>
        <div><span>A cobrar en efectivo</span><strong>{money(cashPending)}</strong></div>
        <div><span>Productos en inventario</span><strong>{number(catalog.length)}</strong><small>{number(units)} unidades · {number(empty)} sin stock</small></div>
      </section>

      <section className="mg-panel">
        <header className="mg-panel-head">
          <h2>Stock bajo</h2>
          <span className="mg-muted">{lowStock.length ? `${number(lowStock.length)} productos con ${LOW_STOCK} unidades o menos` : 'Sin alertas'}</span>
          <button type="button" className="mg-link" onClick={() => onSection('products', 'low')}>Ver en productos <ChevronRight size={15} /></button>
        </header>
        {lowStock.length ? (
          <ul className="mg-low-list">
            {lowStock.slice(0, 8).map(item => (
              <li key={item.barcode}>
                <button type="button" onClick={() => onEdit(item)}>
                  <span className="mg-thumb">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <Package size={17} />}</span>
                  <span className="mg-low-copy"><strong>{item.name}</strong><small>{item.brand || item.barcode}</small></span>
                  <span className={`mg-stock ${Number(item.stock) === 0 ? 'is-empty' : 'is-low'}`}>{Number(item.stock) === 0 ? 'Sin stock' : `${number(item.stock)} u.`}</span>
                  <Pencil size={15} className="mg-muted" />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="mg-empty-inline"><CheckCircle2 size={18} /> Todos los productos tienen más de {LOW_STOCK} unidades.</p>}
      </section>
    </div>
  );
}

function ProductsPage({ catalog, onEdit, onAdd, onDelete, deletingBarcode, initialFilter }) {
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState(initialFilter || 'all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => { setFilter(initialFilter || 'all'); }, [initialFilter]);
  useEffect(() => { setLimit(PAGE_SIZE); }, [term, filter]);
  const counts = useMemo(() => ({
    low: catalog.filter(item => { const s = Number(item.stock) || 0; return s > 0 && s <= LOW_STOCK; }).length,
    empty: catalog.filter(item => (Number(item.stock) || 0) === 0).length,
  }), [catalog]);
  const filtered = useMemo(() => {
    const query = term.trim().toLocaleLowerCase('es');
    return catalog.filter(item => {
      const matchesText = !query || [item.name, item.brand, item.category, ...productBarcodes(item)].some(value => String(value || '').toLocaleLowerCase('es').includes(query));
      const stock = Number(item.stock) || 0;
      const matchesStock = filter === 'all' || (filter === 'low' ? stock > 0 && stock <= LOW_STOCK : stock === 0);
      return matchesText && matchesStock;
    }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }, [catalog, filter, term]);

  return (
    <div className="mg-page">
      <div className="mg-page-head">
        <div><h1>Productos</h1><p>Precios y stock del local. Lo que cambies acá se ve en el modo venta y en la tienda online.</p></div>
        <div className="mg-page-actions"><button type="button" className="mg-btn primary" onClick={onAdd}><Plus size={17} /> Nuevo producto</button></div>
      </div>
      <div className="mg-toolbar">
        <div className="mg-tabs" role="tablist" aria-label="Filtrar por stock">
          {[['all', 'Todos', null], ['low', 'Stock bajo', counts.low], ['empty', 'Sin stock', counts.empty]].map(([id, label, count]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}{count ? <b>{count}</b> : null}</button>
          ))}
        </div>
        <label className="mg-search"><Search size={16} /><input value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar por nombre, marca o código de barras" aria-label="Buscar productos" /></label>
      </div>
      <section className="mg-panel mg-table-panel">
        <div className="mg-table-wrap">
          <table className="mg-table">
            <thead><tr><th scope="col">Producto</th><th scope="col">Código</th><th scope="col" className="mg-num">Precio</th><th scope="col" className="mg-num">Stock</th><th scope="col"><span className="mg-sr">Acciones</span></th></tr></thead>
            <tbody>
              {filtered.slice(0, limit).map(item => {
                const stock = Number(item.stock) || 0;
                return (
                  <tr key={item.barcode}>
                    <td><span className="mg-table-product"><span className="mg-thumb">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <Package size={17} />}</span><span><strong>{item.name}</strong><small>{[item.brand, item.quantity, item.category].filter(Boolean).join(' · ') || 'Sin detalle'}</small></span></span></td>
                    <td className="mg-code">{item.barcode}</td>
                    <td className="mg-num mg-price">{money(item.price)}</td>
                    <td className="mg-num"><span className={`mg-stock ${stock === 0 ? 'is-empty' : stock <= LOW_STOCK ? 'is-low' : 'is-ok'}`}>{stock === 0 ? 'Sin stock' : `${number(stock)} u.`}</span></td>
                    <td><div className="mg-row-actions"><button type="button" className="mg-icon-btn" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}><Pencil size={16} /></button><button type="button" className="mg-icon-btn danger" onClick={() => onDelete(item)} disabled={Boolean(deletingBarcode)} aria-label={`Eliminar ${item.name}`}>{deletingBarcode === item.barcode ? <Loader2 size={16} className="mg-spin" /> : <Trash2 size={16} />}</button></div></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="5"><div className="mg-empty"><Search size={22} /><p>No hay productos con esa búsqueda. Probá con otra palabra o agregá uno nuevo.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="mg-table-foot">
          <span>{number(Math.min(limit, filtered.length))} de {number(filtered.length)} productos{filtered.length !== catalog.length ? ` (total ${number(catalog.length)})` : ''}</span>
          {filtered.length > limit && <button type="button" className="mg-btn ghost" onClick={() => setLimit(value => value + PAGE_SIZE)}>Mostrar {number(Math.min(PAGE_SIZE, filtered.length - limit))} más</button>}
        </footer>
      </section>
    </div>
  );
}

function MovementsPage({ movements, loading, stockTrackingAvailable, onRefresh }) {
  const [openId, setOpenId] = useState('');
  return (
    <div className="mg-page">
      <div className="mg-page-head">
        <div><h1>Movimientos</h1><p>Ventas del mostrador e ingresos de stock, del más reciente al más viejo.</p></div>
        <div className="mg-page-actions"><button type="button" className="mg-btn ghost" onClick={onRefresh} disabled={loading}>{loading ? <Loader2 size={16} className="mg-spin" /> : <RefreshCw size={16} />} Actualizar</button></div>
      </div>
      {stockTrackingAvailable === false && <div className="mg-notice"><AlertTriangle size={17} />El historial de ingresos de stock todavía no está activo en la base de datos.</div>}
      <section className="mg-panel">
        {loading && !movements.length ? <div className="mg-empty"><Loader2 size={20} className="mg-spin" /><p>Cargando movimientos…</p></div> : movements.length ? (
          <ul className="mg-moves">
            {movements.map(movement => {
              const open = openId === movement.id;
              const isPurchase = movement.kind === 'purchase';
              const units = isPurchase ? movement.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : movement.quantityAdded;
              return (
                <li key={movement.id} className={open ? 'is-open' : ''}>
                  <button type="button" className="mg-move" onClick={() => setOpenId(open ? '' : movement.id)} aria-expanded={open}>
                    <span className={`mg-move-icon ${isPurchase ? 'is-sale' : 'is-stock'}`}>{isPurchase ? <ShoppingCart size={16} /> : <PackagePlus size={16} />}</span>
                    <span className="mg-move-copy"><strong>{isPurchase ? 'Venta en el mostrador' : `Ingreso de stock: ${movement.name}`}</strong><small>{dateTime(movement.at)} · {isPurchase ? `${number(units)} unidades` : `stock ${number(movement.previousStock)} → ${number(movement.newStock)}`}</small></span>
                    <span className="mg-move-total">{isPurchase ? money(movement.total) : `+${number(units)} u.`}</span>
                    <ChevronDown size={17} className="mg-move-chevron" />
                  </button>
                  {open && (
                    <div className="mg-move-detail">
                      {isPurchase
                        ? movement.items.map((item, index) => <div key={`${item.barcode}-${index}`}><span>{item.qty} × {item.name}</span><strong>{money(Number(item.price) * Number(item.qty))}</strong></div>)
                        : <div><span>{movement.name} · código {movement.barcode}</span><strong>+{number(units)} u.</strong></div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <div className="mg-empty"><ArrowDownUp size={22} /><p>Todavía no hay movimientos. Las ventas del mostrador y los ingresos de stock aparecen acá.</p></div>}
      </section>
    </div>
  );
}

function SettingsPage({ onSales, onLogout, theme, onThemeChange, notificationsEnabled, onEnableNotifications, lastSync, onRefresh, syncing }) {
  return (
    <div className="mg-page">
      <div className="mg-page-head"><div><h1>Configuración</h1><p>Preferencias de este dispositivo y de la sesión.</p></div></div>
      <section className="mg-settings">
        <article className="mg-panel mg-setting">
          <h2>Apariencia</h2>
          <p>Claro u oscuro, para el modo venta y gestión en esta computadora.</p>
          <ThemePicker theme={theme} onChange={onThemeChange} />
        </article>
        <article className="mg-panel mg-setting">
          <h2>Avisos de pedidos</h2>
          <p>Con los avisos activados, la computadora muestra una notificación cuando entra un pedido online, aunque estés en otra pestaña.</p>
          {notificationsEnabled === null ? <span className="mg-muted">Este navegador no permite avisos.</span>
            : notificationsEnabled ? <span className="mg-state is-ok"><Bell size={16} /> Avisos activados</span>
              : <button type="button" className="mg-btn ghost" onClick={onEnableNotifications}><BellOff size={16} /> Activar avisos</button>}
        </article>
        <article className="mg-panel mg-setting">
          <h2>Datos del local</h2>
          <p>El inventario se revisa cada minuto con una consulta liviana y se descarga solo si cambió algo, para cuidar el plan gratis de Supabase.</p>
          <span className="mg-muted">{lastSync ? `Inventario actualizado ${timeAgo(lastSync)}` : 'Sin actualizar todavía'}</span>
          <button type="button" className="mg-btn ghost" onClick={onRefresh} disabled={syncing}>{syncing ? <Loader2 size={16} className="mg-spin" /> : <RefreshCw size={16} />} Actualizar ahora</button>
        </article>
        <article className="mg-panel mg-setting">
          <h2>Sesión</h2>
          <p>Cerrar sesión te devuelve a la pantalla de inicio. La clave es la misma para venta y gestión.</p>
          <div className="mg-setting-actions">
            <button type="button" className="mg-btn ghost" onClick={onSales}><ShoppingCart size={16} /> Ir al modo venta</button>
            <button type="button" className="mg-btn danger-ghost" onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button>
          </div>
        </article>
      </section>
    </div>
  );
}

function ProductEditor({ product, busy, error, onClose, onSave, setError }) {
  const [form, setForm] = useState(() => product ? {
    barcode: product.barcode || '', name: product.name || '', brand: product.brand || '', category: product.category || '', quantity: product.quantity || '', price: String(product.price ?? 0), stock: String(product.stock ?? 0), image: product.image || '',
  } : emptyProduct());
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submit = event => { event.preventDefault(); setError(''); onSave(form); };

  return (
    <div className="mg-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mg-dialog" role="dialog" aria-modal="true" aria-labelledby="mg-editor-title">
        <header><h2 id="mg-editor-title">{product ? 'Editar producto' : 'Nuevo producto'}</h2><button type="button" className="mg-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
        <form onSubmit={submit}>
          <div className="mg-form-grid">
            <label className="mg-field full"><span>Código de barras</span><input value={form.barcode} onChange={event => set('barcode', event.target.value.replace(/\D/g, ''))} inputMode="numeric" minLength="8" maxLength="14" pattern="[0-9]{8,14}" required disabled={Boolean(product)} autoFocus={!product} /></label>
            <label className="mg-field full"><span>Nombre</span><input value={form.name} onChange={event => set('name', event.target.value)} maxLength="180" required autoFocus={Boolean(product)} /></label>
            <label className="mg-field"><span>Marca</span><input value={form.brand} onChange={event => set('brand', event.target.value)} maxLength="100" /></label>
            <label className="mg-field"><span>Categoría</span><input value={form.category} onChange={event => set('category', event.target.value)} maxLength="100" /></label>
            <label className="mg-field"><span>Contenido</span><input value={form.quantity} onChange={event => set('quantity', event.target.value)} maxLength="80" placeholder="Ej. 500 ml" /></label>
            <label className="mg-field"><span>Precio</span><input type="number" min="0" step="0.01" value={form.price} onChange={event => set('price', event.target.value)} required /></label>
            <label className="mg-field"><span>Stock</span><input type="number" min="0" step="1" value={form.stock} onChange={event => set('stock', event.target.value)} required /></label>
            <label className="mg-field full"><span>Imagen (opcional)</span><input type="url" value={form.image} onChange={event => set('image', event.target.value)} placeholder="https://…" /></label>
          </div>
          {error && <div className="mg-notice tone-danger"><CircleAlert size={16} />{error}</div>}
          <footer><button type="button" className="mg-btn ghost" onClick={onClose}>Cancelar</button><button type="submit" className="mg-btn primary" disabled={busy}>{busy ? <><Loader2 size={16} className="mg-spin" /> Guardando…</> : 'Guardar producto'}</button></footer>
        </form>
      </section>
    </div>
  );
}

function ManagementShell({ section, onSection, theme, onThemeChange, onSales, onLogout, webOrders, lastSync, syncing, onRefreshAll, children }) {
  const orders = webOrders.data?.orders || [];
  const attentionCount = orders.filter(needsAttention).length;
  const newCount = orders.filter(order => order.order_status === 'pending_review').length;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  return (
    <div className={`mg-app ${theme === 'light' ? 'is-light' : ''}`}>
      <aside className="mg-sidebar">
        <a href="/gestion" className="mg-brand" onClick={event => { event.preventDefault(); onSection('home'); }}><Logo /></a>
        <nav aria-label="Secciones de gestión">
          {NAV.map(group => (
            <div className="mg-nav-group" key={group.group}>
              <span className="mg-nav-title">{group.group}</span>
              {group.items.map(item => {
                const Icon = item.icon;
                const selected = section === item.id;
                return (
                  <button type="button" key={item.id} className={`mg-nav-item ${selected ? 'is-active' : ''}`} onClick={() => onSection(item.id)} aria-current={selected ? 'page' : undefined}>
                    <Icon size={18} /><span>{item.label}</span>
                    {item.id === 'orders' && attentionCount > 0 && <b className={`mg-badge ${newCount ? 'is-new' : ''}`} aria-label={`${attentionCount} para atender`}>{attentionCount}</b>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mg-sidebar-foot">
          <button type="button" className="mg-nav-item" onClick={onSales}><ShoppingCart size={18} /><span>Modo venta</span></button>
          <button type="button" className="mg-nav-item is-quiet" onClick={onLogout}><LogOut size={18} /><span>Cerrar sesión</span></button>
        </div>
      </aside>

      <main className="mg-workspace">
        <header className="mg-topbar">
          <button type="button" className="mg-sync" onClick={onRefreshAll} disabled={syncing} title="Actualizar inventario y pedidos">
            {syncing ? <Loader2 size={14} className="mg-spin" /> : <RefreshCw size={14} />}
            <span>{lastSync ? `Inventario al día · revisado ${timeAgo(lastSync, now)}` : 'Conectando…'}</span>
          </button>
          <button type="button" className="mg-theme-toggle" onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Pasar a modo oscuro' : 'Pasar a modo claro'} title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}<span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span></button>
          {newCount > 0 && section !== 'orders' && <button type="button" className="mg-new-orders" onClick={() => onSection('orders')}><BellRing size={15} /> {newCount === 1 ? '1 pedido nuevo' : `${newCount} pedidos nuevos`}</button>}
        </header>
        <div className="mg-content">{children}</div>
      </main>
    </div>
  );
}

export default function ManagementApp({ theme = 'dark', onThemeChange = () => {}, onSales = () => {}, onExit = () => {} }) {
  const mobile = typeof navigator !== 'undefined' && (navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(max-width: 760px)').matches);
  const [status, setStatus] = useState(mobile ? 'mobile' : 'loading');
  const [catalog, setCatalog] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [stockTrackingAvailable, setStockTrackingAvailable] = useState(null);
  const [section, setSectionState] = useState(sectionFromHash);
  const [productFilter, setProductFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editorProduct, setEditorProduct] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingBarcode, setDeletingBarcode] = useState('');
  const [editorError, setEditorError] = useState('');
  const [toast, setToast] = useState(null);
  const [lastSync, setLastSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [webData, setWebData] = useState(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [webWorking, setWebWorking] = useState('');
  const [webLoaded, setWebLoaded] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => (typeof Notification === 'undefined' ? null : Notification.permission === 'granted'));
  const knownPending = useRef(null);
  const versionRef = useRef('');
  const lastFullRef = useRef(0);
  const movementsAtRef = useRef(0);
  const toastTimer = useRef(0);

  const showToast = useCallback((text, tone = 'ok', ms = 3400) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const setSection = useCallback((next, filter) => {
    setSectionState(next);
    if (next === 'products') setProductFilter(filter || 'all');
    const hash = HASH[next] ? `#${HASH[next]}` : '';
    if (window.location.hash !== hash) window.history.replaceState({}, '', `/gestion${hash}`);
  }, []);
  const openOrder = useCallback(id => { setSelectedOrderId(id); setSection('orders'); }, [setSection]);

  const applyState = useCallback(data => {
    setCatalog(data.catalog || []);
    setStatus('ready');
    setMessage('');
    lastFullRef.current = Date.now();
    setLastSync(Date.now());
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

  const loadMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const activity = await request('/api/shop/movements');
      setMovements(activity.movements || []);
      setStockTrackingAvailable(activity.stockTrackingAvailable);
      movementsAtRef.current = Date.now();
    } catch { }
    finally { setLoadingMovements(false); }
  }, [request]);

  // Inventory: tiny version check; the full catalog is downloaded only when something changed.
  const syncInventory = useCallback(async ({ force = false } = {}) => {
    if (document.visibilityState !== 'visible' && !force) return;
    let changed = force || Date.now() - lastFullRef.current > FULL_RELOAD_MS;
    try {
      const { version } = await request('/api/shop/state?version=1');
      if (versionRef.current && version !== versionRef.current) changed = true;
      versionRef.current = version;
    } catch (error) { if (error.status === 401) return; changed = true; }
    if (changed) {
      setSyncing(true);
      try {
        const state = await request('/api/shop/state');
        setCatalog(state.catalog || []);
        lastFullRef.current = Date.now();
        if (movementsAtRef.current) void loadMovements();
      } catch { }
      finally { setSyncing(false); }
    }
    setLastSync(Date.now());
  }, [loadMovements, request]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    void syncInventory();
    const timer = window.setInterval(() => void syncInventory(), VERSION_CHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void syncInventory(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [status, syncInventory]);

  // Movements only load when that section is opened (and again when the inventory changes).
  useEffect(() => {
    if (status === 'ready' && section === 'movements' && Date.now() - movementsAtRef.current > 60_000) void loadMovements();
  }, [loadMovements, section, status]);

  // Online orders. A new cash order (or a newly paid one) shows a toast, a short sound,
  // a browser notification and a counter in the tab title.
  const loadWebOrders = useCallback(async () => {
    setWebLoading(true);
    try {
      const data = await request('/api/shop/web-orders');
      setWebData(data);
      setWebError('');
      setWebLoaded(Date.now());
      const pending = (data.orders || []).filter(needsAttention).map(order => order.id);
      if (knownPending.current) {
        const fresh = (data.orders || []).filter(order => needsAttention(order) && !knownPending.current.has(order.id));
        if (fresh.length) {
          const text = fresh.length === 1 ? `Nuevo pedido online de ${fresh[0].customer_name}` : `${fresh.length} pedidos online nuevos`;
          showToast(text, 'new', 7000);
          try {
            const audio = new (window.AudioContext || window.webkitAudioContext)();
            [0, .18].forEach((delay, index) => {
              const tone = audio.createOscillator(); const gain = audio.createGain();
              tone.frequency.value = index ? 1175 : 880;
              gain.gain.setValueAtTime(.12, audio.currentTime + delay); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + delay + .45);
              tone.connect(gain).connect(audio.destination); tone.start(audio.currentTime + delay); tone.stop(audio.currentTime + delay + .45);
            });
          } catch { }
          try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('CR Perfumería', { body: text, icon: '/nuevologo.jpg', tag: 'web-order' }); } catch { }
        }
      }
      knownPending.current = new Set(pending);
    } catch (error) {
      if (error.status !== 401) setWebError(error.message || 'No se pudieron cargar los pedidos online.');
    } finally { setWebLoading(false); }
  }, [request, showToast]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    void loadWebOrders();
    let last = Date.now();
    const timer = window.setInterval(() => {
      const wait = document.visibilityState === 'visible' ? ORDERS_VISIBLE_MS : ORDERS_HIDDEN_MS;
      if (Date.now() - last >= wait - 1000) { last = Date.now(); void loadWebOrders(); }
    }, ORDERS_VISIBLE_MS);
    return () => window.clearInterval(timer);
  }, [loadWebOrders, status]);

  useEffect(() => {
    const count = (webData?.orders || []).filter(order => order.order_status === 'pending_review').length;
    document.title = count ? `(${count}) CR Perfumería · Gestión` : 'CR Perfumería · Gestión';
  }, [webData]);

  useEffect(() => {
    const onPop = () => setSectionState(sectionFromHash());
    window.addEventListener('hashchange', onPop);
    return () => window.removeEventListener('hashchange', onPop);
  }, []);

  const refreshAll = async () => {
    await Promise.all([syncInventory({ force: true }), loadWebOrders()]);
  };

  const webOrderAction = async (order, action, note = '') => {
    setWebWorking(`${order.id}:${action}`);
    try {
      await request('/api/shop/web-orders', { method: 'POST', body: JSON.stringify({ orderId: order.id, action, note }) });
      await loadWebOrders();
      const done = { accept: 'Pedido aceptado. Ya podés prepararlo.', confirm_payment: 'Pago confirmado. El pedido pasó a Pagados; avisale por WhatsApp.', ready: 'Pedido marcado como listo para retirar.', deliver: 'Pedido entregado.', reject: 'Pedido cancelado. El stock volvió al inventario.' }[action];
      showToast(done);
      if (action === 'reject' || action === 'deliver') void syncInventory({ force: action === 'reject' });
    } catch (error) {
      showToast(error.message || 'No se pudo actualizar el pedido.', 'danger', 5000);
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
  const closeEditor = useCallback(() => setEditorOpen(false), []);

  const saveProduct = async form => {
    setSavingProduct(true);
    setEditorError('');
    try {
      const { product } = await request('/api/shop/products', { method: 'POST', body: JSON.stringify({ ...form, price: Number(form.price), stock: Number(form.stock), barcodes: editorProduct?.barcodes || [form.barcode] }) });
      setCatalog(previous => [...previous.filter(item => item.barcode !== product.barcode), product].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')));
      setEditorOpen(false);
      showToast('Producto guardado.');
    } catch (error) { setEditorError(error.message || 'No se pudo guardar el producto.'); }
    finally { setSavingProduct(false); }
  };

  const [savingImage, setSavingImage] = useState('');
  const saveImage = async (product, image) => {
    setSavingImage(product.barcode);
    try {
      const { product: saved } = await request('/api/shop/products', { method: 'POST', body: JSON.stringify({ action: 'image', barcode: product.barcode, image }) });
      setCatalog(previous => previous.map(item => (item.barcode === saved.barcode ? saved : item)));
      showToast(image ? 'Foto guardada. En un par de minutos aparece en la tienda.' : 'Foto quitada.');
      return true;
    } catch (error) {
      showToast(error.message || 'No se pudo guardar la foto.', 'danger', 5000);
      return false;
    } finally { setSavingImage(''); }
  };

  const deleteProduct = async product => {
    const confirmed = window.confirm(`¿Eliminar “${product.name}” del inventario?\n\nSe borra el producto. Las ventas ya registradas se conservan.`);
    if (!confirmed) return;
    setDeletingBarcode(product.barcode);
    try {
      const result = await request(`/api/shop/products?barcode=${encodeURIComponent(product.barcode)}`, { method: 'DELETE' });
      if (result.barcode !== product.barcode) throw new Error('No se pudo confirmar la eliminación. Actualizá la lista y volvé a intentar.');
      setCatalog(previous => previous.filter(item => item.barcode !== product.barcode));
      showToast('Producto eliminado del inventario.');
    } catch (error) {
      showToast(error.message || 'No se pudo eliminar el producto.', 'danger', 5000);
    } finally { setDeletingBarcode(''); }
  };

  if (mobile) return <MobileNotice theme={theme} />;
  if (status === 'loading') return <main className={`mg-screen ${theme === 'light' ? 'is-light' : ''}`}><div className="mg-entry mg-loading"><Logo /><Loader2 size={26} className="mg-spin" /><p>Conectando con los datos del local…</p></div></main>;
  if (status !== 'ready') return <EntryPanel password={password} setPassword={setPassword} onSubmit={login} busy={busy} message={message} onSales={onSales} theme={theme} />;

  const orders = webData?.orders || [];
  return (
    <>
      <ManagementShell section={section} onSection={setSection} theme={theme} onThemeChange={onThemeChange} onSales={onSales} onLogout={logout} webOrders={{ data: webData }} lastSync={lastSync} syncing={syncing} onRefreshAll={refreshAll}>
        {section === 'home' && <Dashboard catalog={catalog} orders={orders} onSection={setSection} onOpenOrder={openOrder} onEdit={openEditor} />}
        {section === 'orders' && <WebOrdersPage data={webData} loading={webLoading} error={webError} onRefresh={loadWebOrders} onAction={webOrderAction} working={webWorking} notificationsEnabled={notificationsEnabled} onEnableNotifications={enableNotifications} selectedId={selectedOrderId} onSelect={setSelectedOrderId} lastLoaded={webLoaded} />}
        {section === 'products' && <ProductsPage catalog={catalog} onEdit={openEditor} onAdd={() => openEditor(null)} onDelete={deleteProduct} deletingBarcode={deletingBarcode} initialFilter={productFilter} />}
        {section === 'photos' && <PhotosPage catalog={catalog} onSaveImage={saveImage} savingBarcode={savingImage} />}
        {section === 'movements' && <MovementsPage movements={movements} loading={loadingMovements} stockTrackingAvailable={stockTrackingAvailable} onRefresh={loadMovements} />}
        {section === 'settings' && <SettingsPage onSales={onSales} onLogout={logout} theme={theme} onThemeChange={onThemeChange} notificationsEnabled={notificationsEnabled} onEnableNotifications={enableNotifications} lastSync={lastSync} onRefresh={() => syncInventory({ force: true })} syncing={syncing} />}
      </ManagementShell>
      {editorOpen && <ProductEditor key={editorProduct?.barcode || 'new-product'} product={editorProduct} busy={savingProduct} error={editorError} setError={setEditorError} onClose={closeEditor} onSave={saveProduct} />}
      {toast && <div className={`mg-toast tone-${toast.tone}`} role="status">{toast.tone === 'danger' ? <AlertTriangle size={17} /> : toast.tone === 'new' ? <BellRing size={17} /> : <CheckCircle2 size={17} />}{toast.text}</div>}
    </>
  );
}
