import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  History,
  Home,
  Info,
  Loader2,
  LogOut,
  Menu,
  Minus,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  equivalentBarcodes,
  fetchSources,
  findLocalProduct,
  isBarcode,
  mergeProduct,
  parseNumber,
  productBarcodes,
  sanitizeStoredProduct,
  tidy,
  totalUnits,
} from './catalog';
import ThemePicker from './ThemePicker';
import './style.css';

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const money = (value) => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))}`;
const priceLabel = (value) => (Number(value) > 0 ? money(value) : '$ —');
const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date).replace(',', ' ·');
};
const sameDay = (value) => {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
};
const overlaps = (a, b) => {
  const left = new Set(productBarcodes(a).flatMap(equivalentBarcodes));
  const right = productBarcodes(b).flatMap(equivalentBarcodes);
  return right.some(code => left.has(code));
};
const UNREGISTERED_KEY = 'cr-venta-sin-registrar';
// A USB barcode gun types like a keyboard; on a computer the scan box keeps focus. On a phone it would pop the keyboard, so there the camera stays the default.
const prefersUsbScanner = () => {
  try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; }
};
const isEditable = (element) => Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)));
const readUnregistered = () => {
  try {
    const rows = JSON.parse(localStorage.getItem(UNREGISTERED_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(row => isBarcode(row?.barcode)).map(row => ({ barcode: String(row.barcode), qty: Math.max(1, Math.floor(Number(row.qty) || 1)), at: row.at || new Date().toISOString() })) : [];
  } catch { return []; }
};

function ScanBar({ onCode, keepFocus }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!keepFocus) return undefined;
    inputRef.current?.focus();
    // After a click on + / - / quitar, focus goes back to the scan box so the next scan lands there.
    const refocus = () => setTimeout(() => {
      if (!inputRef.current || document.activeElement === inputRef.current) return;
      if (isEditable(document.activeElement)) return;
      inputRef.current.focus({ preventScroll: true });
    }, 0);
    document.addEventListener('focusin', refocus);
    document.addEventListener('pointerup', refocus);
    window.addEventListener('focus', refocus);
    return () => {
      document.removeEventListener('focusin', refocus);
      document.removeEventListener('pointerup', refocus);
      window.removeEventListener('focus', refocus);
    };
  }, [keepFocus]);
  const submit = (event) => {
    event.preventDefault();
    const code = value.trim();
    setValue('');
    if (code) onCode(code);
    inputRef.current?.focus();
  };
  return (
    <form className="scan-bar" onSubmit={submit}>
      <Barcode size={20} />
      <input
        ref={inputRef}
        value={value}
        onChange={event => setValue(event.target.value.replace(/[^\d]/g, ''))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Escaneá con el lector"
        aria-label="Código de barras para agregar a la compra"
      />
      <span className="scan-bar-hint">Se agrega solo</span>
    </form>
  );
}

const cartUnits = (cart) => cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
const cartAmount = (cart) => cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);

function LogoMark({ size = 34 }) {
  return <img width={size} height={size} src="/nuevologo.jpg" alt="" aria-hidden="true" className="logo-mark" />;
}

function Brand({ onClick, small = false }) {
  return (
    <button type="button" className={`brand-lockup ${small ? 'is-small' : ''}`} onClick={onClick} aria-label="Ir al inicio de CR Perfumería">
      <LogoMark size={small ? 29 : 34} />
      <span>CR Perfumería</span>
    </button>
  );
}

function DatabaseGate({ password, onPasswordChange, onSubmit, message, showMissingPassword, busy, configured, theme }) {
  return (
    <div className={`app-shell screen-database-gate ${theme === 'light' ? 'theme-light' : ''}`}>
      <main className="database-gate">
        <LogoMark size={72} />
        <h1>Datos del local</h1>
        <p>{configured ? 'Ingresá la clave del local para cargar el inventario y las compras.' : 'La aplicación no está configurada. Avisá al responsable del local.'}</p>
        <form onSubmit={onSubmit}>
          <label className="field">
            <span>Clave de acceso</span>
            <input type="password" value={password} onChange={event => onPasswordChange(event.target.value)} autoComplete="current-password" />
          </label>
          {showMissingPassword && <div className="form-error"><Info size={16} /> Ingresa la clave de acceso del local.</div>}
          {message && <div className="form-error"><Info size={16} /> {message}</div>}
          <button className="primary-cta" type="submit" disabled={busy || !configured}>
            {busy ? <><Loader2 size={17} className="spin" /> Iniciando…</> : 'Iniciar'}
          </button>
        </form>
      </main>
    </div>
  );
}

function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 190 205" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="spray-body" x1="63" y1="67" x2="132" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a9e9ff" stopOpacity=".98" />
          <stop offset=".45" stopColor="#6fc9f3" />
          <stop offset="1" stopColor="#3b86d8" />
        </linearGradient>
        <linearGradient id="spray-liquid" x1="75" y1="118" x2="125" y2="182" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5ed3f7" />
          <stop offset="1" stopColor="#2370c8" />
        </linearGradient>
        <linearGradient id="spray-trigger" x1="80" y1="30" x2="142" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#89e8ff" />
          <stop offset="1" stopColor="#4ba6ea" />
        </linearGradient>
        <linearGradient id="small-bottle" x1="145" y1="115" x2="182" y2="194" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9fe8ff" />
          <stop offset=".5" stopColor="#5cbdf0" />
          <stop offset="1" stopColor="#2c7cd0" />
        </linearGradient>
        <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="10" stdDeviation="11" floodColor="#1c0b62" floodOpacity=".35" />
        </filter>
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <ellipse cx="107" cy="128" rx="72" ry="63" fill="#b06bff" opacity=".24" filter="url(#glow)" />
      <g filter="url(#soft-shadow)">
        <path d="M75 66c0-7 4-12 10-15V36h9V20h7v16h10v13c8 4 13 10 13 18v16H75V66Z" fill="#a5edff" opacity=".65" />
        <path d="M80 58h29c12 0 22 9 22 21v99c0 11-9 20-20 20H79c-11 0-20-9-20-20V79c0-12 9-21 21-21Z" fill="url(#spray-body)" />
        <path d="M84 118h39v61c0 6-5 11-11 11H94c-6 0-11-5-11-11v-61Z" fill="url(#spray-liquid)" opacity=".82" />
        <rect x="69" y="111" width="68" height="27" rx="5" fill="#d8f7ff" opacity=".75" />
        <path d="M82 123h39M82 130h23" stroke="#2c80c9" strokeWidth="3.2" strokeLinecap="round" opacity=".6" />
        <path d="M78 63h37v17c0 5-4 9-9 9H87c-5 0-9-4-9-9V63Z" fill="url(#spray-trigger)" />
        <rect x="72" y="52" width="42" height="14" rx="5" fill="#3c86d2" />
        <path d="M62 30h43c7 0 13 5 13 12v7h-8v-5c0-3-3-6-6-6H66c-3 0-5 2-5 5v5h-8v-7c0-6 4-11 9-11Z" fill="url(#spray-trigger)" />
        <path d="M62 34c-8 0-15 5-15 12v5h8v-4c0-4 3-6 7-6h4v-7h-4Z" fill="#68bef0" />
        <path d="M71 39c-3 0-6 2-8 5l4 3c1-2 2-3 4-3v-5Z" fill="#d7f7ff" opacity=".75" />
        <path d="M65 164c19 8 43 8 63 0v19c0 7-6 13-13 13H78c-7 0-13-6-13-13v-19Z" fill="#2b74c5" opacity=".32" />
        <path d="M72 83c4-6 11-9 19-9" stroke="#e8fbff" strokeWidth="5" strokeLinecap="round" opacity=".8" />
      </g>
      <g filter="url(#soft-shadow)">
        <rect x="142" y="125" width="40" height="66" rx="10" fill="url(#small-bottle)" />
        <rect x="147" y="137" width="30" height="30" rx="4" fill="#f2fbff" opacity=".8" />
        <rect x="152" y="145" width="20" height="4" rx="2" fill="#2d7dcc" opacity=".55" />
        <rect x="152" y="152" width="14" height="4" rx="2" fill="#2d7dcc" opacity=".4" />
        <path d="M154 117h16v10h-16z" fill="#3f8fd6" />
        <path d="M151 105h22c3 0 5 2 5 5s-2 5-5 5h-22z" fill="#6cc8f0" />
        <path d="M156 101h11v5h-11z" fill="#2f7dc7" />
        <path d="M177 110h6c4 0 7 3 7 7s-3 7-7 7h-6" stroke="#8fdcf7" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="48" cy="173" r="5" fill="#9b7aff" opacity=".55" />
      <circle cx="161" cy="40" r="6" fill="#9b7aff" opacity=".35" />
      <path d="M35 128c10-5 20-4 29 4" stroke="#a382ff" strokeWidth="3" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}

function BottomNav({ active, onNavigate, purchaseNoticeCount }) {
  const tabs = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'purchases', label: 'Compras', icon: ShoppingCart, badge: purchaseNoticeCount },
    { id: 'profile', label: 'Ajustes', icon: User },
  ];

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`nav-item ${isActive ? 'is-active' : ''}`}
            onClick={() => onNavigate(tab.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Icon size={23} strokeWidth={isActive ? 2.3 : 1.85} />
              {tab.badge > 0 && <span className="nav-badge">{tab.badge > 9 ? '9+' : tab.badge}</span>}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function CompactHeader({ onMenu, onHome }) {
  return (
    <header className="compact-header">
      <Brand small onClick={onHome} />
      <button type="button" className="menu-button" onClick={onMenu} aria-label="Abrir menú">
        <Menu size={25} />
      </button>
    </header>
  );
}

function MenuDrawer({ open, onClose, onNavigate, onInstall, onLogout, purchaseNoticeCount, loggingOut }) {
  if (!open) return null;
  const links = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'products', label: 'Productos', icon: Box },
    { id: 'purchases', label: 'Compras', icon: ShoppingCart, badge: purchaseNoticeCount },
    { id: 'history', label: 'Historial', icon: History },
    { id: 'profile', label: 'Ajustes', icon: User },
  ];
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menú" onClick={event => event.stopPropagation()}>
        <div className="drawer-top">
          <Brand onClick={() => { onNavigate('home'); onClose(); }} />
          <button type="button" className="icon-close" onClick={onClose} aria-label="Cerrar menú"><X size={20} /></button>
        </div>
        <nav className="drawer-nav">
          {links.map(link => {
            const Icon = link.icon;
            return (
              <button key={link.id} type="button" onClick={() => { onNavigate(link.id); onClose(); }}>
                <Icon size={20} />
                <span>{link.label}</span>
                {link.badge > 0 && <b className="drawer-badge">{link.badge}</b>}
                <ChevronRight size={17} className="drawer-chevron" />
              </button>
            );
          })}
        </nav>
        <button type="button" className="drawer-install" onClick={() => { onInstall(); onClose(); }}>
          <Download size={19} />
          <span>Instalar la app</span>
        </button>
        <button type="button" className="drawer-logout" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? <Loader2 size={19} className="spin" /> : <LogOut size={19} />}
          <span>{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</span>
        </button>
      </aside>
    </div>
  );
}

function Toast({ toast, onAction }) {
  if (!toast) return null;
  const type = toast.type || 'success';
  const Icon = type === 'error' ? Info : type === 'cart' ? CheckCircle2 : Check;
  return (
    <div key={toast.id} className={`toast ${type}`} role="status">
      <span className="toast-icon"><Icon size={type === 'cart' ? 22 : 18} strokeWidth={2.4} /></span>
      <span className="toast-copy">
        {toast.title && <strong>{toast.title}</strong>}
        <span>{toast.message}</span>
      </span>
      {toast.action && (
        <button type="button" className="toast-action" onClick={onAction}>{toast.action}</button>
      )}
      {type === 'cart' && <span className="toast-life" aria-hidden="true" />}
    </div>
  );
}

function InstallDialog({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="icon-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
        <div className="dialog-icon"><LogoMark size={38} /></div>
        <h2 id="install-title">Instalá la aplicación</h2>
        <p>Agregala a este dispositivo para abrirla como una app. Necesita conexión a Internet para consultar y guardar los datos del local.</p>
        <div className="install-steps">
          <strong>En iPhone o iPad</strong>
          <span>En Safari, tocá <b>Compartir</b> y elegí <b>Agregar a pantalla de inicio</b>.</span>
          <strong>En Android</strong>
          <span>En Chrome, abrí el menú ⋮ y tocá <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</span>
          <strong>En computadora</strong>
          <span>En Chrome o Edge, abrí el menú de los tres puntos y elegí <b>Instalar aplicación</b> o <b>Instalar este sitio como aplicación</b>.</span>
        </div>
        <button type="button" className="primary-cta" onClick={onClose}>Entendido</button>
      </section>
    </div>
  );
}

function ProductThumb({ src, name, className = '', iconSize = 26 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return (
    <div className={`product-thumb ${className}`}>
      {src && !failed
        ? <img src={src} alt={name || 'Producto'} loading="lazy" onError={() => setFailed(true)} />
        : <Package size={iconSize} strokeWidth={1.6} aria-hidden="true" />}
    </div>
  );
}

function EmptyState({ icon: Icon = Package, title, text, children }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={34} strokeWidth={1.6} /></div>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

function PageIntro({ title, text, onBack, action }) {
  return (
    <div className="page-intro">
      <div className="page-intro-row">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} /> Volver</button>
        {action}
      </div>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pantallas                                                           */
/* ------------------------------------------------------------------ */

function HomeScreen({ onRegisterStock, onScanProduct, onStartPurchase, onViewPurchases, onMenu, onHome, cartCount = 0 }) {
  return (
    <div className="home-screen">
      <header className="home-hero">
        <div className="home-hero-top">
          <Brand onClick={onHome} />
          <button type="button" className="menu-button" onClick={onMenu} aria-label="Abrir menú"><Menu size={26} /></button>
        </div>
        <div className="hero-copy">
          <h1>¡Hola!</h1>
          <p>¿Qué querés hacer hoy?</p>
        </div>
        <HeroArt />
      </header>

      <main className="home-sheet">
        <button type="button" className="scan-hero-card" onClick={onScanProduct}>
          <span className="scan-glyph" aria-hidden="true">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <span className="scan-bars" />
          </span>
          <strong>Escanear producto</strong>
          <span>Usá la cámara para leer<br />el código de barras</span>
        </button>

        <div className="home-quick-actions">
          <button type="button" className="quick-action is-primary" onClick={onStartPurchase}>
            <span className="quick-action-icon"><ShoppingCart size={30} strokeWidth={1.7} /></span>
            <strong>{cartCount > 0 ? `Continuar compra (${cartCount})` : 'Iniciar compra'}</strong>
            <ChevronRight size={20} />
          </button>
          <button type="button" className="quick-action" onClick={onRegisterStock}>
            <span className="quick-action-icon"><PackagePlus size={30} strokeWidth={1.7} /></span>
            <strong>Registrar stock</strong>
            <ChevronRight size={20} />
          </button>
          <button type="button" className="quick-action" onClick={onViewPurchases}>
            <span className="quick-action-icon"><History size={30} strokeWidth={1.7} /></span>
            <strong>Ver compras</strong>
            <ChevronRight size={20} />
          </button>
        </div>
      </main>
    </div>
  );
}

function LoadingProduct({ barcode }) {
  return (
    <div className="product-loading">
      <span className="loader-ring"><Loader2 size={38} /></span>
      <strong>Buscando producto…</strong>
      <span>Código {barcode}</span>
      <p>Consultando tu inventario y las fuentes de productos.</p>
    </div>
  );
}

function NotFoundProduct({ barcode, cart, cartTotal, onAddInventory, onScanAgain, onReviewPurchase }) {
  return (
    <section className="not-found">
      <div className="not-found-mark">
        <Barcode size={46} strokeWidth={1.5} />
        <span><Search size={17} strokeWidth={2.4} /></span>
      </div>
      <span className="code-eyebrow">CÓDIGO {barcode}</span>
      <h1>NO SE ENCONTRÓ<br />EL PRODUCTO</h1>
      <p>No figura en tu inventario ni en las fuentes consultadas. Cargalo una vez y quedará reconocido para la próxima.</p>
      <div className="not-found-actions">
        <button type="button" className="primary-cta" onClick={onAddInventory}>
          <PackagePlus size={19} /> AÑADIR AL INVENTARIO
        </button>
        <div className="product-actions-row">
          <ScanNextButton onClick={onScanAgain} />
          <ReviewPurchaseButton cart={cart} total={cartTotal} onReview={onReviewPurchase} />
        </div>
      </div>
    </section>
  );
}

function ScanNextButton({ onClick }) {
  return (
    <button type="button" className="next-product-cta" onClick={onClick}>
      <Camera size={17} /> Siguiente producto
    </button>
  );
}

function FinalizeButton({ cart, total, onFinalize, wide = false, busy = false }) {
  const units = cartUnits(cart);
  const disabled = !cart.length;
  return (
    <>
      <button
        type="button"
        className={`finalize-cta ${wide ? 'is-wide' : ''}`}
        onClick={onFinalize}
        disabled={disabled || busy}
      >
        <span className="finalize-icon">{busy ? <Loader2 size={19} className="spin" /> : <CheckCircle2 size={19} strokeWidth={2.2} />}</span>
        <span className="finalize-copy">
          <strong>{busy ? 'Registrando compra…' : 'Finalizar compra'}</strong>
          <small>{disabled ? 'Sin productos' : `${units} unidad${units === 1 ? '' : 'es'} · ${money(total)}`}</small>
        </span>
      </button>

    </>
  );
}

function ReviewPurchaseButton({ cart, total, onReview }) {
  const units = cartUnits(cart);
  const disabled = !cart.length;
  return (
    <button type="button" className="finalize-cta" onClick={onReview} disabled={disabled}>
      <span className="finalize-icon"><CheckCircle2 size={19} strokeWidth={2.2} /></span>
      <span className="finalize-copy">
        <strong>Finalizar compra</strong>
        <small>{disabled ? 'Sin productos' : `${units} unidad${units === 1 ? '' : 'es'} · ${money(total)}`}</small>
      </span>
    </button>
  );
}

function FoundProduct({ product, busy, cart, cartTotal, onAdd, onScanAgain, onReviewPurchase, onEditInventory, canEdit }) {
  const inInventory = Boolean(product.inInventory);
  const stock = Math.max(0, Number(product.stock) || 0);
  const inCart = (cart || []).reduce((sum, row) => overlaps(row, product) ? sum + (Number(row.qty) || 0) : sum, 0);
  const available = inInventory ? Math.max(0, stock - inCart) : 0;
  const canAdd = inInventory && available > 0;
  const [qty, setQty] = useState(1);
  const limit = Math.max(1, available);
  const unitPrice = Number(product.price) || 0;
  const subtotal = unitPrice * qty;
  const addLabel = !inInventory
    ? 'Primero cargalo en el inventario'
    : stock === 0
      ? 'Sin stock disponible'
      : available === 0
        ? 'Ya agregaste todo el stock'
        : 'Agregar a la compra';

  useEffect(() => { setQty(1); }, [product.barcode, available]);

  const changeQty = (delta) => setQty(value => Math.min(limit, Math.max(1, value + delta)));

  return (
    <>
      <section className="product-summary">
        <ProductThumb src={product.image} name={product.name} className="detail" iconSize={44} />
        <div className="product-summary-copy">
          <span className="source-chip">{product.inInventory ? 'En tu inventario' : (product.source || 'Producto encontrado')}</span>
          <h1>{product.name}</h1>
          <p><span>Marca:</span> {product.brand || 'Sin marca'}</p>
          <p><span>Tipo:</span> {product.category || 'Limpieza'}</p>
          {product.quantity && <p><span>Contenido:</span> {product.quantity}</p>}
          {busy && <span className="inline-search"><Loader2 size={12} /> Buscando más datos…</span>}
        </div>
      </section>

      <div className={`stock-pill ${inInventory && stock === 0 ? 'is-empty' : ''}`}>
        <span className="stock-icon"><Package size={26} strokeWidth={1.7} /></span>
        <span className="stock-copy">
          <span>{inInventory ? 'Stock disponible' : 'Inventario del local'}</span>
          <strong>{inInventory ? `${stock} unidad${stock === 1 ? '' : 'es'}` : 'Todavía no está cargado'}</strong>
        </span>
        {canEdit && (
          <button type="button" className="stock-edit" onClick={onEditInventory} aria-label="Editar stock y precio">
            <Pencil size={16} />
          </button>
        )}
      </div>

      <div className="price-row">
        <span className="price-icon"><Tag size={25} strokeWidth={1.7} /></span>
        <span className="price-copy">
          <span>{inInventory ? 'Precio' : 'Precio de referencia'}</span>
          <strong>{priceLabel(product.price)}</strong>
          {!inInventory && <small>Es orientativo. Cargá tu precio en el inventario.</small>}
          {inInventory && !(Number(product.price) > 0) && <small>Cargá el precio desde el inventario</small>}
        </span>
      </div>

      <div className="qty-picker">
        <span className="qty-picker-icon"><ShoppingCart size={21} strokeWidth={1.8} /></span>
        <span className="qty-picker-copy">
          <span>Cantidad</span>
          <strong>{unitPrice > 0 ? `Subtotal ${money(subtotal)}` : 'Unidades a llevar'}</strong>
        </span>
        <div className="qty-stepper" aria-label="Cantidad de unidades">
          <button type="button" onClick={() => changeQty(-1)} disabled={qty <= 1} aria-label="Restar una unidad"><Minus size={16} /></button>
          <strong>{qty}</strong>
          <button type="button" onClick={() => changeQty(1)} disabled={!canAdd || qty >= available} aria-label="Sumar una unidad"><Plus size={16} /></button>
        </div>
      </div>

      <div className="product-actions">
        <button type="button" className="primary-cta add-to-cart" onClick={() => onAdd(qty)} disabled={!canAdd}>
          <span className="cta-plus"><Plus size={17} strokeWidth={2.8} /></span> {addLabel}
        </button>
        <div className="product-actions-row">
          <ScanNextButton onClick={onScanAgain} />
          <ReviewPurchaseButton cart={cart} total={cartTotal} onReview={onReviewPurchase} />
        </div>
      </div>

      {!product.inInventory && (
        <button type="button" className="inventory-hint" onClick={onEditInventory}>
          <PackagePlus size={16} /> Cargar stock y precio en el inventario
        </button>
      )}
    </>
  );
}

function ProductScreen({
  barcode,
  product,
  busy,
  cart,
  cartTotal,
  onBack,
  onScanAgain,
  onAddInventory,
  onEditInventory,
  onAddToCart,
  onReviewPurchase,
}) {
  const loading = busy && !product?.name;
  const found = Boolean(product?.name);
  return (
    <main className="app-body product-page">
      <div className="product-topline">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={19} /> Volver</button>
        <span className="barcode-chip"><Barcode size={14} /> {barcode}</span>
      </div>

      {loading && <LoadingProduct barcode={barcode} />}
      {!loading && found && (
        <FoundProduct
          product={product}
          busy={busy}
          cart={cart}
          cartTotal={cartTotal}
          onAdd={onAddToCart}
          onScanAgain={onScanAgain}
          onReviewPurchase={onReviewPurchase}
          onEditInventory={onEditInventory}
          canEdit
        />
      )}
      {!loading && !found && (
        <NotFoundProduct
          barcode={barcode}
          cart={cart}
          cartTotal={cartTotal}
          onAddInventory={onAddInventory}
          onScanAgain={onScanAgain}
          onReviewPurchase={onReviewPurchase}
        />
      )}
    </main>
  );
}

function CartScreen({ cart, unregistered = [], total, onBack, onScan, onScanCode, keepScanFocus, onChangeQty, onRemove, onChangeUnregistered, onRemoveUnregistered, onRegister, onFinalize, finalizing }) {
  const units = cartUnits(cart);
  const missing = unregistered.length;
  const lines = cart.length + missing;
  return (
    <main className="app-body">
      <PageIntro
        title="Tu compra"
        text={lines ? `${cart.length} producto${cart.length === 1 ? '' : 's'} · ${units} unidad${units === 1 ? '' : 'es'}${missing ? ` · ${missing} sin registrar` : ''}` : 'Todavía no agregaste productos.'}
        onBack={onBack}
        action={<button type="button" className="header-action" onClick={onScan}><Camera size={16} /> Cámara</button>}
      />
      <ScanBar onCode={onScanCode} keepFocus={keepScanFocus} />
      {lines === 0 ? (
        <EmptyState icon={ShoppingCart} title="Tu compra está vacía" text="Escaneá un producto con el lector y se agrega solo. Si lo escaneás de nuevo, suma una unidad.">
          <button type="button" className="primary-cta" onClick={onScan}><Camera size={18} /> Escanear con la cámara</button>
        </EmptyState>
      ) : (
        <>
          <div className="cart-list">
            {unregistered.map(item => (
              <article className="cart-item is-unregistered" key={`missing-${item.barcode}`}>
                <span className="product-thumb cart unregistered-mark" aria-hidden="true"><Barcode size={22} /></span>
                <div className="cart-copy">
                  <strong><span className="unregistered-tag">Sin registrar</span> Código {item.barcode}</strong>
                  <span>No está en el inventario. No se cobra hasta cargarlo.</span>
                  <button type="button" className="register-link" onClick={() => onRegister(item.barcode)}><PackagePlus size={13} /> Cargar producto</button>
                </div>
                <div className="qty-control" aria-label={`Cantidad del código ${item.barcode}`}>
                  <button type="button" onClick={() => onChangeUnregistered(item.barcode, -1)} aria-label="Restar uno"><Minus size={14} /></button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => onChangeUnregistered(item.barcode, 1)} aria-label="Sumar uno"><Plus size={14} /></button>
                </div>
                <div className="cart-tail">
                  <strong>$ —</strong>
                  <button type="button" className="remove-button" onClick={() => onRemoveUnregistered(item.barcode)} aria-label={`Quitar el código ${item.barcode}`}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
            {cart.map(item => (
              <article className="cart-item" key={item.barcode}>
                <ProductThumb src={item.image} name={item.name} className="cart" iconSize={22} />
                <div className="cart-copy">
                  <strong>{item.name || 'Producto'}</strong>
                  <span>{[item.brand, item.quantity].filter(Boolean).join(' · ') || 'Sin detalle'}</span>
                  <b>{priceLabel(item.price)}</b>
                </div>
                <div className="qty-control" aria-label={`Cantidad de ${item.name}`}>
                  <button type="button" onClick={() => onChangeQty(item.barcode, -1)} aria-label="Restar uno"><Minus size={14} /></button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => onChangeQty(item.barcode, 1)} aria-label="Sumar uno"><Plus size={14} /></button>
                </div>
                <div className="cart-tail">
                  <strong>{priceLabel(item.price * item.qty)}</strong>
                  <button type="button" className="remove-button" onClick={() => onRemove(item.barcode)} aria-label={`Quitar ${item.name}`}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>

          <section className="cart-summary">
            <div><span>Productos</span><strong>{cart.length}</strong></div>
            <div><span>Unidades</span><strong>{units}</strong></div>
            {missing > 0 && <div className="cart-missing"><span>Sin registrar (no se cobran)</span><strong>{missing}</strong></div>}
            <div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div>
            <FinalizeButton cart={cart} total={total} onFinalize={onFinalize} wide busy={finalizing} />
            <button type="button" className="secondary-cta compact" onClick={onScan}>
              <Camera size={17} /> Escanear con la cámara
            </button>
          </section>
        </>
      )}
    </main>
  );
}

function PurchasesScreen({ purchases, onBack, onScan }) {
  const [openId, setOpenId] = useState('');
  const today = purchases.filter(purchase => sameDay(purchase.at));
  const todayTotal = today.reduce((sum, purchase) => sum + (Number(purchase.total) || 0), 0);
  return (
    <main className="app-body">
      <PageIntro
        title="Compras"
        text="Compras registradas en tu local."
        onBack={onBack}
        action={today.length > 0 ? <span className="today-pill">Hoy · {money(todayTotal)}</span> : null}
      />
      <button type="button" className="scan-again-cta" onClick={onScan}>
        <ShoppingCart size={18} /> Iniciar nueva compra
      </button>
      {purchases.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Todavía no hay compras" text="Cuando finalices una compra, va a quedar registrada acá y el stock se va a descontar." />
      ) : (
        <div className="purchase-list">
          {purchases.map(purchase => {
            const units = purchase.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
            const open = openId === purchase.id;
            return (
              <article className={`purchase-card ${open ? 'is-open' : ''}`} key={purchase.id}>
                <button type="button" className="purchase-summary" onClick={() => setOpenId(open ? '' : purchase.id)} aria-expanded={open}>
                  <span className="purchase-date">
                    <span className="purchase-calendar"><Clock size={17} /></span>
                    <span><strong>{money(purchase.total)}</strong><small>{dateLabel(purchase.at)} · {purchase.items.length} producto{purchase.items.length === 1 ? '' : 's'} · {units} unidad{units === 1 ? '' : 'es'}</small></span>
                  </span>
                  <span className="purchase-amount"><ChevronRight size={17} /></span>
                </button>
                {open && (
                  <div className="purchase-detail">
                    {purchase.items.map((item, index) => (
                      <div className="purchase-line" key={`${item.barcode}-${index}`}>
                        <span>{item.name || 'Producto'} <small>x{item.qty}</small></span>
                        <strong>{priceLabel(item.price * item.qty)}</strong>
                      </div>
                    ))}
                    <div className="purchase-line total"><span>Total</span><strong>{money(purchase.total)}</strong></div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function ProductsScreen({ catalog, onBack, onAdd, onOpen, onEdit }) {
  const [term, setTerm] = useState('');
  const filtered = useMemo(() => {
    const needle = tidy(term).toLowerCase();
    const rows = needle
      ? catalog.filter(item => [item.name, item.brand, item.category, ...productBarcodes(item)].filter(Boolean).some(value => String(value).toLowerCase().includes(needle)))
      : catalog;
    return [...rows].sort((a, b) => tidy(a.name).localeCompare(tidy(b.name), 'es'));
  }, [catalog, term]);
  const units = totalUnits(catalog);
  const lowStock = catalog.filter(item => Number(item.stock) <= 3).length;

  return (
    <main className="app-body">
      <PageIntro
        title="Productos"
        text="Los productos guardados en tu inventario."
        onBack={onBack}
        action={<button type="button" className="header-action" onClick={onAdd}><Plus size={16} /> Agregar</button>}
      />
      {catalog.length > 0 && (
        <div className="mini-stats">
          <div><span>Productos</span><strong>{catalog.length}</strong></div>
          <div><span>Unidades</span><strong>{units}</strong></div>
          <div><span>Stock bajo</span><strong className={lowStock ? 'warn' : ''}>{lowStock}</strong></div>
        </div>
      )}
      <label className="search-field compact-search">
        <Search size={18} />
        <input value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar por nombre, marca o código" aria-label="Buscar producto en el inventario" />
        {term && <button type="button" onClick={() => setTerm('')} aria-label="Limpiar búsqueda"><X size={15} /></button>}
      </label>

      {catalog.length === 0 ? (
        <EmptyState icon={Box} title="Tu inventario está vacío" text="Escaneá un producto y cargalo, o agregalo manualmente desde acá.">
          <button type="button" className="primary-cta" onClick={onAdd}><PackagePlus size={18} /> Agregar producto</button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Sin coincidencias" text="Probá con otro nombre o código de barras." />
      ) : (
        <div className="inventory-list">
          {filtered.map(item => (
            <article className="inventory-row" key={item.barcode}>
              <button type="button" className="inventory-main" onClick={() => onOpen(item)}>
                <ProductThumb src={item.image} name={item.name} className="list" iconSize={22} />
                <span className="inventory-copy">
                  <strong>{item.name}</strong>
                  <span>{[item.brand, item.category].filter(Boolean).join(' · ') || item.barcode}</span>
                  <small>{priceLabel(item.price)}</small>
                </span>
                <span className={`stock-badge ${Number(item.stock) === 0 ? 'empty' : Number(item.stock) <= 3 ? 'low' : ''}`}>
                  {Number(item.stock) || 0} u.
                </span>
              </button>
              <button type="button" className="edit-button" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}><Pencil size={16} /></button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function HistoryScreen({ history, onBack, onLookup, onClear }) {
  return (
    <main className="app-body">
      <PageIntro
        title="Historial"
        text="Los últimos códigos que escaneaste."
        onBack={onBack}
        action={history.length > 0 ? <button type="button" className="header-action muted" onClick={onClear}><Trash2 size={15} /> Limpiar</button> : null}
      />
      {history.length === 0 ? (
        <EmptyState icon={History} title="Sin escaneos todavía" text="Cuando escanees un producto, el código va a quedar acá para volver a consultarlo." />
      ) : (
        <div className="history-list">
          {history.map((row, index) => (
            <button type="button" className="history-row" key={`${row.barcode}-${index}`} onClick={() => onLookup(row.barcode, { back: 'history' })}>
              <span className={`history-icon ${row.found === false ? 'miss' : row.found ? 'ok' : ''}`}>
                {row.found === false ? <Search size={17} /> : <Check size={17} />}
              </span>
              <span className="history-copy">
                <strong>{row.name || (row.found === false ? 'No se encontró el producto' : 'Código escaneado')}</strong>
                <span>{row.barcode} · {dateLabel(row.at)}</span>
              </span>
              <ChevronRight size={17} className="history-arrow" />
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function SearchScreen({ catalog, onBack, onLookup, onOpenLocal, onScan }) {
  const [term, setTerm] = useState('');
  const [sharedResults, setSharedResults] = useState([]);
  const [sharedState, setSharedState] = useState('idle');
  const normalizedCode = tidy(term).replace(/\s/g, '');
  const validCode = isBarcode(normalizedCode);

  const localResults = useMemo(() => {
    const needle = tidy(term).toLowerCase();
    if (!needle) return [];
    return catalog.filter(item => [item.name, item.brand, item.category, ...productBarcodes(item)]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [catalog, term]);

  useEffect(() => {
    const text = tidy(term);
    if (text.length < 3 || isBarcode(text)) {
      setSharedResults([]);
      setSharedState('idle');
      return undefined;
    }
    let cancelled = false;
    setSharedState('loading');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(5000) });
        const result = await response.json();
        if (!cancelled) {
          setSharedResults(result.products || []);
          setSharedState(result.configured === false ? 'not_configured' : 'ready');
        }
      } catch {
        if (!cancelled) { setSharedResults([]); setSharedState('error'); }
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [term]);

  const submit = (event) => {
    event.preventDefault();
    if (validCode) { onLookup(normalizedCode, { back: 'search' }); return; }
    if (localResults[0]) onOpenLocal(localResults[0]);
  };

  const showEmpty = tidy(term).length > 0 && localResults.length === 0 && sharedResults.length === 0 && sharedState !== 'loading' && !validCode;

  return (
    <main className="app-body">
      <PageIntro
        title="Consultar producto"
        text="Buscá por nombre o ingresá el código de barras."
        onBack={onBack}
        action={<button type="button" className="header-action" onClick={onScan}><Camera size={16} /> Escanear</button>}
      />
      <form className="search-field consult-search" onSubmit={submit}>
        <Search size={19} />
        <input value={term} onChange={event => setTerm(event.target.value)} placeholder="Ej. Detergente Ala o 7791290792098" aria-label="Buscar producto" autoComplete="off" />
        {term && <button type="button" onClick={() => setTerm('')} aria-label="Limpiar búsqueda"><X size={16} /></button>}
      </form>

      {validCode && (
        <button type="button" className="code-search-card" onClick={() => onLookup(normalizedCode, { back: 'search' })}>
          <span className="code-search-icon"><Barcode size={25} /></span>
          <span><strong>Buscar código {normalizedCode}</strong><small>Consultar inventario y fuentes de productos</small></span>
          <ChevronRight size={19} />
        </button>
      )}

      {localResults.length > 0 && (
        <section className="search-section">
          <h2>En tu inventario</h2>
          <div className="inventory-list">
            {localResults.map(item => (
              <button type="button" className="search-result" key={item.barcode} onClick={() => onOpenLocal(item)}>
                <ProductThumb src={item.image} name={item.name} className="list" iconSize={22} />
                <span className="search-result-copy">
                  <strong>{item.name}</strong>
                  <span>{[item.brand, item.category].filter(Boolean).join(' · ') || item.barcode}</span>
                </span>
                <span className="search-result-price">{priceLabel(item.price)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isBarcode(term) && tidy(term).length >= 3 && (
        <section className="search-section">
          <h2>Catálogo compartido {sharedState === 'loading' && <Loader2 size={14} className="spin" />}</h2>
          {sharedResults.length > 0 ? (
            <div className="inventory-list">
              {sharedResults.slice(0, 6).map(item => (
                <button type="button" className="search-result" key={`${item.barcode}-${item.name}`} onClick={() => onLookup(item.barcode, { back: 'search' })}>
                  <ProductThumb src={item.image} name={item.name} className="list" iconSize={22} />
                  <span className="search-result-copy">
                    <strong>{item.name}</strong>
                    <span>{[item.brand, item.quantity].filter(Boolean).join(' · ') || item.barcode}</span>
                  </span>
                  <span className="shared-tag">Compartido</span>
                </button>
              ))}
            </div>
          ) : sharedState === 'not_configured' ? (
            <p className="search-note">El catálogo compartido no está conectado. Podés buscar por código o cargar el producto manualmente.</p>
          ) : sharedState === 'error' ? (
            <p className="search-note">No se pudo consultar el catálogo compartido. Probá de nuevo o buscá por código.</p>
          ) : sharedState === 'ready' ? (
            <p className="search-note">Sin coincidencias en el catálogo compartido.</p>
          ) : null}
        </section>
      )}

      {showEmpty && <EmptyState icon={Search} title="Sin resultados" text="Probá con otro nombre o consultá el código de barras." />}

      {!tidy(term) && (
        <div className="search-tip">
          <span className="search-tip-icon"><Camera size={22} /></span>
          <div><strong>¿Tenés el producto a mano?</strong><p>Escaneá el código y consultá la ficha al instante.</p></div>
          <button type="button" className="round-action" onClick={onScan} aria-label="Escanear producto"><ArrowRight size={18} /></button>
        </div>
      )}
    </main>
  );
}

function ProfileScreen({ catalog, purchases, onBack, onProducts, onPurchases, onHistory, onInstall, onResetInventory, theme, onThemeChange }) {
  const [confirming, setConfirming] = useState(false);
  const units = totalUnits(catalog);
  const sold = purchases.reduce((sum, purchase) => sum + (Number(purchase.total) || 0), 0);
  return (
    <main className="app-body">
      <PageIntro title="Ajustes" onBack={onBack} />
      <section className="profile-card">
        <div className="profile-avatar"><LogoMark size={48} /></div>
        <div>
          <strong>CR Perfumería</strong>
          <span>Gestión de productos para tu local</span>
        </div>
        <span className="profile-pill">APP</span>
      </section>

      <div className="profile-stats">
        <div><strong>{catalog.length}</strong><span>productos</span></div>
        <div><strong>{units}</strong><span>unidades</span></div>
        <div><strong>{purchases.length}</strong><span>compras</span></div>
      </div>

      <section className="profile-section">
        <h2>Tu local</h2>
        <button type="button" className="profile-row" onClick={onProducts}><span className="profile-row-icon"><Box size={19} /></span><span><strong>Inventario</strong><small>{catalog.length} productos · {units} unidades</small></span><ChevronRight size={17} /></button>
        <button type="button" className="profile-row" onClick={onPurchases}><span className="profile-row-icon"><ShoppingCart size={19} /></span><span><strong>Compras</strong><small>{money(sold)} registrados</small></span><ChevronRight size={17} /></button>
        <button type="button" className="profile-row" onClick={onHistory}><span className="profile-row-icon"><History size={19} /></span><span><strong>Historial de escaneos</strong><small>Volvé a consultar un código</small></span><ChevronRight size={17} /></button>
      </section>

      <section className="profile-section">
        <h2>Apariencia</h2>
        <div className="profile-row appearance-row">
          <span className="profile-row-icon"><Sun size={19} /></span>
          <span><strong>Modo claro u oscuro</strong><small>Elegí el aspecto de la aplicación</small></span>
          <ThemePicker theme={theme} onChange={onThemeChange} />
        </div>
      </section>

      <section className="profile-section">
        <h2>Aplicación</h2>
        <button type="button" className="profile-row" onClick={onInstall}><span className="profile-row-icon"><Download size={19} /></span><span><strong>Instalar aplicación</strong><small>Instalala en este dispositivo</small></span><ChevronRight size={17} /></button>
        <div className="profile-row static"><span className="profile-row-icon"><ShieldCheck size={19} /></span><span><strong>Datos guardados del local</strong><small>El inventario, los precios, las compras y el historial se comparten entre dispositivos.</small></span></div>
      </section>

      <section className="profile-section inventory-reset-section">
        <h2>Precios</h2>
        <p>Este botón pone los precios de tus productos en $0. Los productos y el stock se conservan.</p>
        <button type="button" className="danger-button" onClick={() => setConfirming(true)}><Trash2 size={17} /> Poner todos los precios en $0</button>
      </section>
      <p className="version-note">CR Perfumería · versión 1.0</p>

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(false)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <div className="confirm-icon"><Trash2 size={24} /></div>
            <h2>¿Reiniciar los precios?</h2>
            <p>Los precios de todos los productos se pondrán en $0. Los productos, el stock y las compras se conservarán.</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-cta compact" onClick={() => setConfirming(false)}>Cancelar</button>
              <button type="button" className="danger-button solid" onClick={() => { setConfirming(false); onResetInventory(); }}>Sí, reiniciar precios</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function InventoryForm({ initial, isEdit, onCancel, onSave }) {
  const [form, setForm] = useState({
    barcode: initial.barcode || '',
    name: initial.name || '',
    brand: initial.brand || '',
    category: initial.category || '',
    quantity: initial.quantity || '',
    price: Number(initial.price) > 0 ? String(initial.price) : '',
    stock: initial.stock !== undefined ? String(initial.stock) : '0',
    image: initial.image || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fixedBarcode = Boolean(initial.barcode);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    const code = tidy(form.barcode).replace(/\s/g, '');
    if (!isBarcode(code)) { setError('Ingresá un código de barras de 8 a 14 números.'); return; }
    if (tidy(form.name).length < 2) { setError('Ingresá el nombre del producto.'); return; }
    const price = Math.max(0, Math.round(parseNumber(form.price) * 100) / 100);
    const stock = Math.max(0, Math.round(parseNumber(form.stock)));
    if (!Number.isFinite(price)) { setError('El precio no es válido.'); return; }
    setError('');
    setSaving(true);
    Promise.resolve(onSave({
      barcode: code,
      barcodes: [...new Set([code, ...(initial.barcodes || [])])],
      name: tidy(form.name),
      brand: tidy(form.brand),
      category: tidy(form.category),
      quantity: tidy(form.quantity),
      price,
      stock,
      image: tidy(form.image),
      source: 'Mi inventario',
    })).catch(saveError => setError(saveError?.message || 'No se pudo guardar el producto. Probá de nuevo.'))
      .finally(() => setSaving(false));
  };

  return (
    <main className="app-body inventory-form-page">
      <div className="product-topline">
        <button type="button" className="back-button" onClick={onCancel}><ArrowLeft size={19} /> Volver</button>
        {fixedBarcode && <span className="barcode-chip"><Barcode size={14} /> {initial.barcode}</span>}
      </div>
      <div className="form-intro">
        <span className="form-icon"><PackagePlus size={25} /></span>
        <h1>{isEdit ? 'Editar producto' : 'Añadir al inventario'}</h1>
        <p>Completá los datos para reconocer el producto y controlar su stock y precio.</p>
      </div>

      <form className="inventory-form" onSubmit={submit}>
        {!fixedBarcode && (
          <label className="field">
            <span>Código de barras</span>
            <div className="input-shell"><Barcode size={17} /><input value={form.barcode} onChange={event => update('barcode', event.target.value)} inputMode="numeric" placeholder="Ej. 7791290792098" /></div>
          </label>
        )}
        <label className="field">
          <span>Nombre del producto *</span>
          <input value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Detergente Líquido Ala" required />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Marca</span>
            <input value={form.brand} onChange={event => update('brand', event.target.value)} placeholder="Ej. Ala" />
          </label>
          <label className="field">
            <span>Tipo</span>
            <input value={form.category} onChange={event => update('category', event.target.value)} placeholder="Ej. Limpieza" list="category-suggestions" />
            <datalist id="category-suggestions">
              <option value="Limpieza" />
              <option value="Detergentes" />
              <option value="Lavandina" />
              <option value="Suavizantes" />
              <option value="Accesorios de limpieza" />
              <option value="Cuidado personal" />
            </datalist>
          </label>
        </div>
        <label className="field">
          <span>Contenido</span>
          <input value={form.quantity} onChange={event => update('quantity', event.target.value)} placeholder="Ej. 750 ml" />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Precio</span>
            <div className="input-shell"><b>$</b><input value={form.price} onChange={event => update('price', event.target.value)} inputMode="decimal" placeholder="0" /></div>
          </label>
          <label className="field">
            <span>Stock</span>
            <div className="input-shell"><Box size={16} /><input value={form.stock} onChange={event => update('stock', event.target.value)} inputMode="numeric" placeholder="0" /></div>
          </label>
        </div>
        <label className="field">
          <span>Imagen (opcional)</span>
          <input value={form.image} onChange={event => update('image', event.target.value)} placeholder="https://…" inputMode="url" />
        </label>

        {error && <div className="form-error"><Info size={16} /> {error}</div>}
        <button type="submit" className="primary-cta save-inventory" disabled={saving}><Check size={19} /> {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar en el inventario'}</button>
        <button type="button" className="secondary-cta compact" onClick={onCancel}>Cancelar</button>
      </form>
    </main>
  );
}

function ScannerScreen({
  videoRef,
  cameraOn,
  cameraError,
  focusMessage,
  zoomState,
  onZoom,
  onClose,
  onManual,
  mode = 'purchase',
  cart = [],
  unregistered = [],
  total = 0,
  finalizing = false,
  onFinalize,
  onCancel,
}) {
  const [manualOpen, setManualOpen] = useState(Boolean(cameraError));
  const sale = mode === 'purchase';
  const units = cartUnits(cart);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (cameraError) setManualOpen(true);
  }, [cameraError]);

  const submitManual = (event) => {
    event.preventDefault();
    if (!isBarcode(manualCode)) return;
    onManual(manualCode);
    if (sale) setManualCode('');
  };

  return (
    <div className="scanner-screen">
      <video ref={videoRef} className="camera-video" muted playsInline />
      <div className="scanner-shade" />
      <header className="scanner-top">
        <div>
          <strong>{sale ? 'Compra en curso' : 'Escanear producto'}</strong>
          <span>{cameraError ? 'Usá el código manual' : sale ? 'Escaneá un producto tras otro: se agregan solos' : 'Enfocá el código de barras'}</span>
        </div>
        <button type="button" className="scanner-close" onClick={onClose} aria-label="Cerrar cámara"><X size={21} /></button>
      </header>

      {!cameraError && (
        <div className="scanner-view">
          <div className={`scan-frame ${cameraOn ? 'is-live' : ''}`}>
            <i /><i /><i /><i />
            {cameraOn && <span className="scan-line" />}
          </div>
          <span className="scanner-status">{cameraOn ? focusMessage : 'Iniciando cámara…'}</span>
        </div>
      )}

      <div className="scanner-panel">
        {cameraError && (
          <div className="camera-error">
            <span><Camera size={22} /></span>
            <div><strong>No se pudo abrir la cámara</strong><p>{cameraError}</p></div>
          </div>
        )}
        {sale && (
          <div className="sale-sheet">
            <div className="sale-sheet-head">
              <strong>{cart.length || unregistered.length ? `${units} unidad${units === 1 ? '' : 'es'} en la compra` : 'Todavía no escaneaste productos'}</strong>
              <b>{money(total)}</b>
            </div>
            {(cart.length > 0 || unregistered.length > 0) && (
              <ul className="sale-sheet-list">
                {unregistered.map(item => (
                  <li key={`missing-${item.barcode}`} className="is-unregistered"><span>{item.qty}×</span><em>Sin registrar · {item.barcode}</em><b>$ —</b></li>
                ))}
                {[...cart].reverse().map(item => (
                  <li key={item.barcode}><span>{item.qty}×</span><em>{item.name || 'Producto'}</em><b>{priceLabel(item.price * item.qty)}</b></li>
                ))}
              </ul>
            )}
            <div className="sale-sheet-actions">
              <button type="button" className="sale-cancel" onClick={onCancel} disabled={finalizing}><X size={16} /> Cancelar</button>
              <button type="button" className="sale-finish" onClick={onFinalize} disabled={!cart.length || finalizing}>
                {finalizing ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Finalizar compra
              </button>
            </div>
          </div>
        )}
        {!sale && <div className="scanner-panel-head">
          <div>
            <strong>{cameraError ? 'Ingresá el código manualmente' : '¿No lee el código?'}</strong>
            <span>{cameraError ? 'Escribí el número que figura debajo del código de barras.' : 'Podés ingresarlo a mano.'}</span>
          </div>
          <span className="live-pill"><i /> EN VIVO</span>
        </div>}

        {zoomState.supported && (
          <label className="scan-zoom">
            <span>Zoom <b>{Number(zoomState.value).toFixed(1)}×</b></span>
            <input type="range" min={zoomState.min} max={zoomState.max} step={zoomState.step} value={zoomState.value} onChange={event => onZoom(event.target.value)} />
          </label>
        )}

        {!manualOpen ? (
          <button type="button" className="manual-toggle" onClick={() => setManualOpen(true)}><Barcode size={18} /> Ingresar código manualmente</button>
        ) : (
          <form className="manual-form" onSubmit={submitManual}>
            <input value={manualCode} onChange={event => setManualCode(event.target.value)} inputMode="numeric" placeholder="Ej. 7791290792098" aria-label="Código de barras" autoFocus={Boolean(cameraError)} />
            <button type="submit" disabled={!isBarcode(manualCode)}>{sale ? <><Plus size={17} /> Agregar</> : <><Search size={17} /> Buscar</>}</button>
          </form>
        )}
        {!sale && <p className="scanner-safe"><ShieldCheck size={14} /> La cámara no guarda fotos</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aplicación                                                          */
/* ------------------------------------------------------------------ */

export default function App({ theme = 'dark', onThemeChange = () => {}, onExit = () => {} }) {
  const [screen, setScreen] = useState('home');
  const [backScreen, setBackScreen] = useState('home');
  const [activeBarcode, setActiveBarcode] = useState('');
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [cart, setCart] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [purchaseNoticeCount, setPurchaseNoticeCount] = useState(0);
  const [purchaseFinalizing, setPurchaseFinalizing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState('loading');
  const [databaseConfigured, setDatabaseConfigured] = useState(true);
  const [databaseBusy, setDatabaseBusy] = useState(false);
  const [databaseMessage, setDatabaseMessage] = useState('');
  const [gatePassword, setGatePassword] = useState('');
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scannerMode, setScannerMode] = useState('purchase');
  const [focusMessage, setFocusMessage] = useState('Enfoque automático');
  const [zoomState, setZoomState] = useState({ supported: false, min: 1, max: 1, step: 0.1, value: 1 });
  const [scannerSession, setScannerSession] = useState(0);
  const [inventoryDraft, setInventoryDraft] = useState(null);
  const [unregistered, setUnregistered] = useState(readUnregistered);
  const unregisteredRef = useRef(unregistered);
  const cartRef = useRef([]);
  const cartMutationRef = useRef(Promise.resolve());
  const purchaseFinalizingRef = useRef(false);
  const addToCartRef = useRef(null);
  const scanIntoSaleRef = useRef(null);
  const updateUnregistered = useCallback((update) => {
    const next = typeof update === 'function' ? update(unregisteredRef.current) : update;
    unregisteredRef.current = next;
    setUnregistered(next);
    try { localStorage.setItem(UNREGISTERED_KEY, JSON.stringify(next)); } catch { }
  }, []);

  const invalidateShopSession = useCallback(() => {
    setDatabaseStatus('locked');
    setCatalog([]);
    setCart([]);
    cartRef.current = [];
    setPurchases([]);
    setPurchasesLoaded(false);
    setPurchaseNoticeCount(0);
    setHistory([]);
    setHistoryLoaded(false);
    setScreen('home');
    setMenuOpen(false);
    setGatePassword('');
    setLoginAttempted(false);
    setDatabaseMessage('La sesión terminó. Iniciá sesión de nuevo.');
  }, []);

  const requestShop = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    let payload = {};
    try { payload = await response.json(); } catch { }
    if (response.status === 401) invalidateShopSession();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'No se pudo completar la operación. Probá de nuevo.'), { status: response.status });
    return payload;
  }, [invalidateShopSession]);

  const commitCart = useCallback((update) => {
    const commit = async () => {
      const previous = cartRef.current;
      const next = typeof update === 'function' ? update(cartRef.current) : update;
      cartRef.current = next;
      setCart(next);
      try {
        const { cart: saved } = await requestShop('/api/shop/cart', { method: 'POST', body: JSON.stringify({ items: next }) });
        cartRef.current = saved;
        setCart(saved);
        return saved;
      } catch (error) {
        cartRef.current = previous;
        setCart(previous);
        throw error;
      }
    };
    const pending = cartMutationRef.current.then(commit, commit);
    cartMutationRef.current = pending.catch(() => {});
    return pending;
  }, [requestShop]);

  const applyShopState = useCallback((data) => {
    setCatalog((data.catalog || []).map(sanitizeStoredProduct));
    const loadedCart = data.cart || [];
    cartRef.current = loadedCart;
    setCart(loadedCart);
    setPurchases(data.purchases || []);
    setPurchasesLoaded(Array.isArray(data.purchases));
    setHistory(data.history || []);
    setHistoryLoaded(Array.isArray(data.history));
    setDatabaseStatus('ready');
    setDatabaseMessage('');
  }, []);

  const connectDatabase = useCallback(async (event) => {
    event.preventDefault();
    setLoginAttempted(true);
    setDatabaseMessage('');
    if (!gatePassword.trim()) return;
    setDatabaseBusy(true);
    try {
      const response = await fetch('/api/shop/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePassword }),
        cache: 'no-store',
      });
      let payload = {};
      try { payload = await response.json(); } catch { }
      if (!response.ok) {
        setDatabaseConfigured(response.status !== 503);
        setDatabaseMessage(payload.error || 'No se pudo conectar con los datos del local.');
        return;
      }
      setGatePassword('');
      setLoginAttempted(false);
      applyShopState(payload);
    } catch {
      setDatabaseMessage('No se pudo conectar con los datos del local. Revisá Internet e intentá otra vez.');
    } finally {
      setDatabaseBusy(false);
    }
  }, [applyShopState, gatePassword]);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try { await fetch('/api/shop/session', { method: 'DELETE', cache: 'no-store' }); } catch { }
    onExit();
  }, [onExit]);

  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const handledRef = useRef(false);
  const lookupTokenRef = useRef(0);
  const scannerCodeRef = useRef(null);
  const scannerModeRef = useRef('purchase');
  const lastCameraReadRef = useRef({ code: '', at: 0 });
  const toastTimerRef = useRef(null);

  const localProduct = useMemo(() => findLocalProduct(catalog, activeBarcode), [catalog, activeBarcode]);
  const externalProduct = useMemo(() => matches.find(item => item.name && item.image) || matches.find(item => item.name) || null, [matches]);
  const product = useMemo(() => mergeProduct(localProduct, externalProduct, activeBarcode), [localProduct, externalProduct, activeBarcode]);
  const cartTotal = cartAmount(cart);
  const inventoryItem = inventoryDraft ? findLocalProduct(catalog, inventoryDraft.barcode) : null;

  const showToast = useCallback((message, type = 'success') => {
    const payload = typeof message === 'string' ? { message, type } : { type: 'success', ...message };
    clearTimeout(toastTimerRef.current);
    setToast({ ...payload, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` });
    const duration = payload.type === 'cart' ? 5200 : payload.type === 'error' ? 4200 : 3600;
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  const addHistory = useCallback(async (entry) => {
    try {
      const { scan } = await requestShop('/api/shop/history', { method: 'POST', body: JSON.stringify(entry) });
      setHistory(prev => [scan, ...prev.filter(row => row.barcode !== scan.barcode)].slice(0, 24));
    } catch (error) {
      showToast(error.message || 'No se pudo guardar el escaneo.', 'error');
    }
  }, [requestShop, showToast]);

  const scanLookup = useCallback(async (rawValue, options = {}) => {
    const code = tidy(rawValue).replace(/\s/g, '');
    if (!isBarcode(code)) {
      showToast('Ingresá un código de barras de 8 a 14 números.', 'error');
      return false;
    }
    const token = ++lookupTokenRef.current;
    setBackScreen(options.back || 'home');
    setActiveBarcode(code);
    setMatches([]);
    setBusy(true);
    setScreen('product');
    setMenuOpen(false);
    const local = findLocalProduct(catalog, code);
    if (local) {
      setBusy(false);
      void addHistory({ barcode: code, at: new Date().toISOString(), found: true, name: local.name });
      return true;
    }

    let historyRecorded = false;
    const recordFound = item => {
      if (!historyRecorded && item.name) {
        historyRecorded = true;
        void addHistory({ barcode: code, at: new Date().toISOString(), found: true, name: item.name });
      }
    };
    void fetchSources(code, () => {}, item => {
      if (token !== lookupTokenRef.current) return;
      setMatches(previous => previous.some(match => match.source === item.source && match.barcode === item.barcode)
        ? previous
        : [...previous, item]);
      if (item.name) {
        setBusy(false);
        recordFound(item);
      }
    }).then(found => {
      if (token !== lookupTokenRef.current) return;
      setMatches(found);
      if (!historyRecorded) {
        historyRecorded = true;
        void addHistory({ barcode: code, at: new Date().toISOString(), found: false, name: '' });
      }
    }).catch(() => {
      if (token !== lookupTokenRef.current) return;
      setMatches([]);
      if (!historyRecorded) void addHistory({ barcode: code, at: new Date().toISOString(), found: false, name: '' });
    }).finally(() => {
      if (token === lookupTokenRef.current) setBusy(false);
    });
    return true;
  }, [addHistory, catalog, showToast]);
  const navigate = useCallback((next) => {
    setMenuOpen(false);
    if (next === 'purchases') setPurchaseNoticeCount(0);
    if (next === 'home') {
      setScreen('home');
      setBackScreen('home');
    } else {
      setScreen(next);
    }
  }, []);

  const reviewPurchase = useCallback(() => {
    setBackScreen(screen);
    setScreen('cart');
    setMenuOpen(false);
  }, [screen]);

  const openScanner = useCallback((mode = 'purchase', returnScreen = 'home') => {
    setScannerMode(mode === 'stock' ? 'stock' : 'purchase');
    setBackScreen(mode === 'stock' ? 'home' : returnScreen);
    handledRef.current = false;
    setCameraError('');
    setZoomState({ supported: false, min: 1, max: 1, step: 0.1, value: 1 });
    setFocusMessage('Enfoque automático');
    setScannerSession(value => value + 1);
    setMenuOpen(false);
    setScreen('scanner');
  }, []);

  const openSale = useCallback((returnScreen = 'home') => {
    if (!prefersUsbScanner()) { openScanner('purchase', returnScreen); return; }
    setBackScreen(returnScreen);
    setScreen('cart');
    setMenuOpen(false);
  }, [openScanner]);

  const continuePurchase = useCallback(() => {
    openSale('home');
  }, [openSale]);

  const startNewPurchase = useCallback(async () => {
    if (!cartRef.current.length) {
      openSale('home');
      return;
    }
    const units = cartUnits(cartRef.current);
    const confirmed = window.confirm(`Ya tenés una compra en curso con ${units} unidad${units === 1 ? '' : 'es'}.\n\n¿Querés descartarla y empezar una nueva?`);
    if (!confirmed) return;
    try {
      await commitCart([]);
      openSale('home');
    } catch (error) {
      showToast(error.message || 'No se pudo iniciar una compra nueva.', 'error');
    }
  }, [commitCart, openSale, showToast]);

  const openProduct = useCallback((item, back = 'products') => {
    const code = item?.barcode || '';
    if (!code) return;
    setBackScreen(back);
    setActiveBarcode(String(code));
    setMatches(item ? [sanitizeStoredProduct(item)] : []);
    setBusy(false);
    setScreen('product');
    setMenuOpen(false);
  }, []);

  const openInventoryForm = useCallback((item, options = {}) => {
    const local = item ? findLocalProduct(catalog, item.barcode) : null;
    const barcode = options.barcode || local?.barcode || item?.barcode || activeBarcode || '';
    const source = local || item || {};
    setInventoryDraft({
      origin: options.origin || 'products',
      barcode: String(barcode || ''),
      barcodes: source.barcodes || [],
      name: source.name || '',
      brand: source.brand || '',
      category: source.category || '',
      quantity: source.quantity || '',
      price: source.price || 0,
      stock: source.stock || 0,
      image: source.image || '',
      isEdit: Boolean(local),
    });
    setScreen('inventory-form');
    setMenuOpen(false);
  }, [activeBarcode, catalog]);

  const handleScannerCode = useCallback(async (rawValue) => {
    if (scannerMode !== 'stock') {
      const scanned = tidy(rawValue).replace(/\s/g, '');
      if (!isBarcode(scanned)) {
        showToast('Ingresá un código de barras de 8 a 14 números.', 'error');
        return false;
      }
      scanIntoSaleRef.current?.(scanned);
      return true;
    }
    const code = tidy(rawValue).replace(/\s/g, '');
    if (!isBarcode(code)) {
      showToast('Ingresá un código de barras de 8 a 14 números.', 'error');
      return false;
    }
    const existing = findLocalProduct(catalog, code);
    setBackScreen('home');
    setActiveBarcode(code);
    if (existing) {
      void addHistory({ barcode: code, at: new Date().toISOString(), found: true, name: existing.name });
      openInventoryForm(existing, { origin: 'products' });
      return true;
    }

    const token = ++lookupTokenRef.current;
    setMatches([]);
    setBusy(true);
    setScreen('product');
    try {
      const results = await fetchSources(code);
      if (token !== lookupTokenRef.current) return false;
      const match = results.find(item => item.name);
      const prefilled = match ? { ...match, price: 0, stock: 0 } : null;
      void addHistory({ barcode: code, at: new Date().toISOString(), found: Boolean(match), name: match?.name || '' });
      openInventoryForm(prefilled, { barcode: code, origin: 'products' });
    } catch {
      if (token !== lookupTokenRef.current) return false;
      void addHistory({ barcode: code, at: new Date().toISOString(), found: false, name: '' });
      openInventoryForm(null, { barcode: code, origin: 'products' });
    } finally {
      if (token === lookupTokenRef.current) setBusy(false);
    }
    return true;
  }, [addHistory, backScreen, catalog, openInventoryForm, scanLookup, scannerMode, showToast]);
  scannerCodeRef.current = handleScannerCode;
  scannerModeRef.current = scannerMode;

  const saveInventory = useCallback(async (entry) => {
    const origin = inventoryDraft?.origin || 'products';
    try {
      const { product: saved } = await requestShop('/api/shop/products', { method: 'POST', body: JSON.stringify(entry) });
      setCatalog(prev => [saved, ...prev.filter(item => !overlaps(item, saved))]);
      setMatches(prev => [saved, ...prev.filter(item => !overlaps(item, saved))]);
      setActiveBarcode(saved.barcode);
      setInventoryDraft(null);
      if (origin === 'cart') {
        setScreen('cart');
        const pending = unregisteredRef.current.filter(row => equivalentBarcodes(row.barcode).some(code => productBarcodes(saved).includes(code)));
        if (pending.length) {
          updateUnregistered(prev => prev.filter(row => !pending.includes(row)));
          addToCartRef.current?.(saved, pending.reduce((sum, row) => sum + row.qty, 0), { local: saved });
        } else {
          showToast('Producto guardado.');
        }
        return;
      }
      setScreen(origin === 'product' ? 'product' : 'products');
      showToast(origin === 'product' ? 'Producto guardado. Ya podés agregarlo a la compra.' : 'Producto guardado.');
    } catch (error) {
      showToast(error.message || 'No se pudo guardar el producto. Probá de nuevo.', 'error');
      throw error;
    }
  }, [inventoryDraft, requestShop, showToast, updateUnregistered]);

  const addToCart = useCallback((item, qty = 1, options = {}) => {
    const local = options.local || findLocalProduct(catalog, item?.barcode || activeBarcode);
    if (!local) {
      showToast('Primero cargá el producto en el inventario para poder venderlo.', 'error');
      return;
    }
    const amount = Math.max(1, Math.floor(Number(qty) || 1));
    const stock = Math.max(0, Number(local.stock) || 0);
    const existing = cartRef.current.find(row => overlaps(row, local));
    const inCart = Number(existing?.qty) || 0;
    if (stock <= 0) {
      showToast('Este producto no tiene stock disponible. Actualizá el stock en el inventario.', 'error');
      return;
    }
    if (inCart + amount > stock) {
      const left = Math.max(0, stock - inCart);
      showToast(left > 0
        ? `Solo quedan ${left} unidad${left === 1 ? '' : 'es'} disponibles de ${local.name}.`
        : `Ya agregaste todo el stock de ${local.name}.`, 'error');
      return;
    }
    const row = {
      barcode: local.barcode,
      name: local.name,
      brand: local.brand || '',
      quantity: local.quantity || '',
      image: local.image || '',
      price: Number(local.price) || 0,
      stock,
      qty: amount,
    };
    void commitCart(prev => {
      const found = prev.find(row => overlaps(row, local));
      if (found) return prev.map(row => overlaps(row, local) ? { ...row, name: local.name, price: Number(local.price) || 0, stock, qty: Math.min(stock, found.qty + amount) } : row);
      return [...prev, row];
    }).then(() => {
      showToast({
        type: 'cart',
        title: 'Agregado a la compra',
        message: `${amount} × ${local.name}${Number(local.price) > 0 ? ` · ${money(Number(local.price) * amount)}` : ''}`,
        action: 'Ver compra',
        actionScreen: 'cart',
      });
      try { navigator.vibrate?.(35); } catch { }
    }).catch(error => showToast(error.message || 'No se pudo guardar la compra en curso.', 'error'));
  }, [activeBarcode, catalog, commitCart, showToast]);
  addToCartRef.current = addToCart;

  // One scan from the USB reader (or a code typed + Enter): straight into the sale, no buttons.
  const scanIntoSale = useCallback((rawValue) => {
    const code = tidy(rawValue).replace(/\s/g, '');
    if (!isBarcode(code)) {
      showToast(`El código “${code.slice(0, 20)}” no es válido. Tiene que tener de 8 a 14 números.`, 'error');
      return;
    }
    const local = findLocalProduct(catalog, code);
    if (local) {
      addToCart(local, 1, { local });
      return;
    }
    updateUnregistered(prev => {
      const found = prev.find(row => equivalentBarcodes(code).includes(row.barcode));
      if (found) return prev.map(row => row === found ? { ...row, qty: row.qty + 1 } : row);
      return [{ barcode: code, qty: 1, at: new Date().toISOString() }, ...prev];
    });
    void addHistory({ barcode: code, at: new Date().toISOString(), found: false, name: '' });
    showToast(`Código ${code} sin registrar. Quedó en la lista en rojo.`, 'error');
    try { navigator.vibrate?.([40, 60, 40]); } catch { }
  }, [addHistory, addToCart, catalog, showToast, updateUnregistered]);
  scanIntoSaleRef.current = scanIntoSale;

  const changeUnregistered = useCallback((barcode, delta) => {
    updateUnregistered(prev => prev.flatMap(row => {
      if (row.barcode !== barcode) return [row];
      const qty = row.qty + delta;
      return qty <= 0 ? [] : [{ ...row, qty }];
    }));
  }, [updateUnregistered]);

  const registerUnregistered = useCallback((barcode) => {
    setBackScreen('cart');
    openInventoryForm(null, { barcode, origin: 'cart' });
  }, [openInventoryForm]);

  const changeQty = useCallback((barcode, delta) => {
    const item = cartRef.current.find(row => equivalentBarcodes(barcode).some(code => productBarcodes(row).includes(code)));
    if (!item) return;
    if (delta > 0) {
      const stock = Math.max(0, Number(item.stock) || 0);
      if (stock <= 0) {
        showToast('Este producto no tiene stock disponible.', 'error');
        return;
      }
      if (item.qty + delta > stock) {
        const left = Math.max(0, stock - item.qty);
        showToast(left > 0
          ? `Solo quedan ${left} unidad${left === 1 ? '' : 'es'} disponibles de ${item.name}.`
          : `Ya agregaste todo el stock de ${item.name}.`, 'error');
        return;
      }
    }
    void commitCart(prev => prev.flatMap(row => {
      if (!equivalentBarcodes(barcode).some(code => productBarcodes(row).includes(code))) return [row];
      const qty = row.qty + delta;
      return qty <= 0 ? [] : [{ ...row, qty: Math.min(qty, Math.max(1, Number(row.stock) || qty)) }];
    })).catch(error => showToast(error.message || 'No se pudo actualizar la compra en curso.', 'error'));
  }, [commitCart, showToast]);

  const removeFromCart = useCallback((barcode) => {
    void commitCart(prev => prev.filter(item => !equivalentBarcodes(barcode).some(code => productBarcodes(item).includes(code))))
      .catch(error => showToast(error.message || 'No se pudo actualizar la compra en curso.', 'error'));
  }, [commitCart, showToast]);

  const finalizePurchase = useCallback(async () => {
    if (purchaseFinalizingRef.current) return;
    purchaseFinalizingRef.current = true;
    setPurchaseFinalizing(true);
    try {
      await cartMutationRef.current;
      const items = cartRef.current;
      if (!items.length) return;
      const missing = unregisteredRef.current.length;
      if (missing && !window.confirm(`Hay ${missing} código${missing === 1 ? '' : 's'} sin registrar en la lista. No se van a cobrar ni a descontar.\n\n¿Registrar la venta igual?`)) return;
      const { purchase } = await requestShop('/api/shop/purchases', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setPurchases(prev => [purchase, ...prev.filter(item => item.id !== purchase.id)].slice(0, 120));
      setPurchaseNoticeCount(count => count + 1);
      const stockChanges = new Map();
      (Array.isArray(purchase.items) ? purchase.items : items).forEach(item => equivalentBarcodes(item.barcode).forEach(code => {
        stockChanges.set(code, (stockChanges.get(code) || 0) + (Number(item.qty) || 0));
      }));
      setCatalog(prev => prev.map(product => {
        const sold = productBarcodes(product).reduce((maximum, code) => Math.max(maximum, stockChanges.get(code) || 0), 0);
        return sold ? { ...product, stock: Math.max(0, Number(product.stock) - sold) } : product;
      }));
      cartRef.current = [];
      setCart([]);
      updateUnregistered([]);
      setScreen('purchases');
      setMenuOpen(false);
      showToast({
        type: 'success',
        title: 'Compra registrada',
        message: `Total ${money(purchase.total)} · El stock ya se actualizó.`,
        action: 'Escanear',
        actionScreen: 'scanner',
      });
    } catch (error) {
      showToast(error.message || 'No se pudo registrar la compra. Probá de nuevo.', 'error');
      requestShop('/api/shop/state')
        .then(state => setCatalog((state.catalog || []).map(sanitizeStoredProduct)))
        .catch(() => {});
    } finally {
      purchaseFinalizingRef.current = false;
      setPurchaseFinalizing(false);
    }
  }, [requestShop, showToast, updateUnregistered]);

  const cancelSale = useCallback(async () => {
    const units = cartUnits(cartRef.current);
    const missing = unregisteredRef.current.length;
    if ((units || missing) && !window.confirm('¿Cancelar la compra? Se vacía el carrito y no se registra nada.')) return;
    try {
      await commitCart([]);
      updateUnregistered([]);
      setScreen('home');
      setBackScreen('home');
      showToast('Compra cancelada.');
    } catch (error) {
      showToast(error.message || 'No se pudo cancelar la compra.', 'error');
    }
  }, [commitCart, showToast, updateUnregistered]);

  const resetInventory = useCallback(async () => {
    try {
      await requestShop('/api/shop/products', { method: 'DELETE' });
      const updatedAt = new Date().toISOString();
      setCatalog(prev => prev.map(item => ({ ...item, price: 0, updatedAt })));
      setMatches(prev => prev.map(item => ({ ...item, price: 0, updatedAt })));
      setScreen('profile');
      showToast('Precios reiniciados a $0. Los productos y el stock se conservaron.');
    } catch (error) {
      showToast(error.message || 'No se pudo reiniciar el inventario.', 'error');
    }
  }, [requestShop, showToast]);

  const clearScanHistory = useCallback(async () => {
    const previous = history;
    setHistory([]);
    try {
      await requestShop('/api/shop/history', { method: 'DELETE' });
      setHistoryLoaded(true);
    } catch (error) {
      setHistory(previous);
      showToast(error.message || 'No se pudo limpiar el historial.', 'error');
    }
  }, [history, requestShop, showToast]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .catch(() => {});
      if ('caches' in window) {
        caches.keys()
          .then(keys => Promise.all(keys
            .filter(key => key.startsWith('cleanstock-shell-') || key.startsWith('limpia-shell-') || key.startsWith('cr-perfumeria-shell-'))
            .map(key => caches.delete(key))))
          .catch(() => {});
      }
    }
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/shop/state', { cache: 'no-store' });
        let payload = {};
        try { payload = await response.json(); } catch { }
        if (!alive) return;
        if (response.ok) applyShopState(payload);
        else {
          setDatabaseConfigured(response.status !== 503);
          setDatabaseMessage(response.status === 401 ? '' : payload.error || 'Conectate para cargar los datos del local.');
          setDatabaseStatus('locked');
        }
      } catch {
        if (alive) {
          setDatabaseMessage('No se pudo conectar con los datos del local. Revisá Internet e intentá otra vez.');
          setDatabaseStatus('locked');
        }
      }
    })();
    return () => { alive = false; };
  }, [applyShopState]);
  useEffect(() => {
    if (databaseStatus !== 'ready') return undefined;
    let checking = false;
    const verifySession = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch('/api/shop/session', { cache: 'no-store' });
        if (response.status === 401) invalidateShopSession();
      } catch { }
      checking = false;
    };
    const timer = window.setInterval(verifySession, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void verifySession(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [databaseStatus, invalidateShopSession]);
  useEffect(() => {
    if (databaseStatus !== 'ready') return undefined;
    let active = true;
    let pending = false;
    let lastVersion = '';
    let lastFull = Date.now();
    // Cheap change check first; the whole catalog is downloaded only when something changed
    // (or every 10 minutes as a safety net). This keeps Supabase usage low on the free plan.
    const refreshSharedData = async () => {
      if (!active || pending || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        let changed = Date.now() - lastFull > 10 * 60_000;
        try {
          const { version } = await requestShop('/api/shop/state?version=1');
          if (lastVersion && version !== lastVersion) changed = true;
          lastVersion = version;
        } catch { changed = true; }
        if (changed) {
          const state = await requestShop('/api/shop/state');
          lastFull = Date.now();
          if (active) setCatalog((state.catalog || []).map(sanitizeStoredProduct));
        }
        if (screen === 'purchases' && changed) {
          const { purchases: latestPurchases } = await requestShop('/api/shop/purchases');
          if (active) {
            setPurchases(latestPurchases || []);
            setPurchasesLoaded(true);
          }
        }
      } catch { }
      finally { pending = false; }
    };
    void refreshSharedData();
    const timer = window.setInterval(refreshSharedData, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSharedData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [databaseStatus, requestShop, screen]);
  useEffect(() => {
    if (databaseStatus !== 'ready' || purchasesLoaded) return undefined;
    let active = true;
    requestShop('/api/shop/purchases')
      .then(({ purchases: rows }) => {
        if (!active) return;
        setPurchases(rows || []);
        setPurchasesLoaded(true);
      })
      .catch(error => { if (active) showToast(error.message || 'No se pudieron cargar las compras.', 'error'); });
    return () => { active = false; };
  }, [databaseStatus, purchasesLoaded, requestShop, showToast]);
  useEffect(() => {
    if (databaseStatus !== 'ready' || historyLoaded) return undefined;
    let active = true;
    requestShop('/api/shop/history')
      .then(({ history: rows }) => {
        if (!active) return;
        setHistory(rows || []);
        setHistoryLoaded(true);
      })
      .catch(error => { if (active) showToast(error.message || 'No se pudo cargar el historial.', 'error'); });
    return () => { active = false; };
  }, [databaseStatus, historyLoaded, requestShop, showToast]);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  useEffect(() => {
    // The reader types digits a few ms apart and ends with Enter. Outside a text box, a fast burst like that is a scan:
    // it goes to the sale and opens it. Slow typing is ignored so normal keys keep working.
    if (databaseStatus !== 'ready' || screen === 'inventory-form' || (screen === 'scanner' && scannerMode === 'stock')) return undefined;
    let buffer = '';
    let last = 0;
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      const now = Date.now();
      if (now - last > 80) buffer = '';
      last = now;
      if (/^\d$/.test(event.key)) { buffer += event.key; return; }
      if (event.key === 'Enter' && isBarcode(buffer)) {
        event.preventDefault();
        event.stopPropagation();
        const code = buffer;
        buffer = '';
        if (screen !== 'cart' && screen !== 'scanner') {
          setBackScreen(screen);
          setScreen('cart');
          setMenuOpen(false);
        }
        scanIntoSaleRef.current(code);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [databaseStatus, screen, scannerMode]);
  useEffect(() => { document.title = 'CR Perfumería · Venta'; }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [screen]);
  const install = useCallback(async () => {
    if (!installPrompt) { setShowInstallHelp(true); return; }
    await installPrompt.prompt();
    setInstallPrompt(null);
  }, [installPrompt]);

  /* Cámara */
  const stopCameraStream = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { }
    try { readerRef.current?.reset(); } catch { }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    controlsRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (screen !== 'scanner') { stopCameraStream(); return undefined; }
    let alive = true;
    handledRef.current = false;
    setCameraOn(false);
    setCameraError('');
    setFocusMessage('Enfoque automático');

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Abrí la app mediante HTTPS para usar la cámara.');
        const [{ BrowserMultiFormatOneDReader, BarcodeFormat }, { default: DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library/esm/core/DecodeHintType.js'),
        ]);
        if (!alive) return;
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
        ]]]);
        const reader = new BrowserMultiFormatOneDReader(hints, {
          delayBetweenScanAttempts: 50,
          delayBetweenScanSuccess: 50,
          tryPlayVideoTimeout: 3000,
        });
        readerRef.current = reader;
        const controls = await reader.decodeFromConstraints({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        }, videoRef.current, (result) => {
          if (!result || handledRef.current) return;
          const code = result.getText();
          if (!code) return;
          if (scannerModeRef.current !== 'stock') {
            // Sale: the camera stays open. The same code is read many times per second while it is in view,
            // so it counts again only after a pause; a different code needs a short gap.
            const now = Date.now();
            const last = lastCameraReadRef.current;
            if ((code === last.code && now - last.at < 2500) || now - last.at < 700) {
              if (code === last.code) lastCameraReadRef.current = { code, at: now };
              return;
            }
            lastCameraReadRef.current = { code, at: now };
            scannerCodeRef.current(code);
            return;
          }
          handledRef.current = true;
          stopCameraStream();
          scannerCodeRef.current(code);
        });
        if (!alive) { try { controls.stop(); } catch { } return; }
        controlsRef.current = controls;
        setCameraOn(true);

        const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
        const capabilities = track?.getCapabilities?.();
        const focusModes = capabilities?.focusMode;
        if (Array.isArray(focusModes) && focusModes.includes('continuous')) {
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            setFocusMessage('Autofocus continuo');
          } catch {
            setFocusMessage('Enfoque automático del teléfono');
          }
        }
        const zoom = capabilities?.zoom;
        if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) {
          const current = track.getSettings?.().zoom ?? zoom.min;
          setZoomState({
            supported: true,
            min: zoom.min,
            max: zoom.max,
            step: zoom.step || 0.1,
            value: Math.min(zoom.max, Math.max(zoom.min, current)),
          });
        }
      } catch (error) {
        if (!alive) return;
        setCameraOn(false);
        setCameraError(
          error?.name === 'NotAllowedError'
            ? 'Permití el acceso a la cámara en el navegador para escanear.'
            : (error?.message || 'No se pudo iniciar la cámara.'),
        );
      }
    })();

    return () => {
      alive = false;
      stopCameraStream();
    };
  }, [screen, scannerSession, stopCameraStream]);

  async function changeZoom(value) {
    const next = Number(value);
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: next }] });
      setZoomState(current => ({ ...current, value: next }));
    } catch {
      showToast('Este teléfono no permite cambiar el zoom desde el navegador.', 'error');
    }
  }

  const navActive = ['cart', 'purchases'].includes(screen)
    ? 'purchases'
    : screen === 'profile'
        ? 'profile'
        : screen === 'home'
          ? 'home'
          : null;

  const goBack = () => {
    if (screen === 'inventory-form') {
      setInventoryDraft(null);
      setScreen(backScreen || 'products');
      return;
    }
    setScreen(backScreen || 'home');
  };

  if (databaseStatus !== 'ready') {
    return (
      <>
        <DatabaseGate
          password={gatePassword}
          onPasswordChange={setGatePassword}
          onSubmit={connectDatabase}
          message={databaseMessage}
          showMissingPassword={loginAttempted && !gatePassword.trim()}
          busy={databaseBusy || databaseStatus === 'loading'}
          configured={databaseConfigured}
          theme={theme}
        />
      </>
    );
  }

  return (
    <div className={`app-shell screen-${screen} ${theme === 'light' ? 'theme-light' : ''}`}>
      {screen === 'home' && (
        <HomeScreen
          onRegisterStock={() => openScanner('stock')}
          onScanProduct={continuePurchase}
          onStartPurchase={continuePurchase}
          onViewPurchases={() => navigate('purchases')}
          onMenu={() => setMenuOpen(true)}
          onHome={() => navigate('home')}
          cartCount={cartUnits(cart)}
        />
      )}

      {screen === 'scanner' && (
        <ScannerScreen
          videoRef={videoRef}
          cameraOn={cameraOn}
          cameraError={cameraError}
          focusMessage={focusMessage}
          zoomState={zoomState}
          onZoom={changeZoom}
          onClose={() => setScreen(backScreen || 'home')}
          onManual={handleScannerCode}
          mode={scannerMode}
          cart={cart}
          unregistered={unregistered}
          total={cartTotal}
          finalizing={purchaseFinalizing}
          onFinalize={finalizePurchase}
          onCancel={cancelSale}
        />
      )}

      {screen !== 'home' && screen !== 'scanner' && (
        <>
          <CompactHeader onMenu={() => setMenuOpen(true)} onHome={() => navigate('home')} />
          {screen === 'product' && (
            <ProductScreen
              barcode={activeBarcode}
              product={product}
              busy={busy}
              cart={cart}
              cartTotal={cartTotal}
              onBack={goBack}
              onScanAgain={() => openScanner('purchase', 'product')}
              onAddInventory={() => openInventoryForm(null, { barcode: activeBarcode, origin: 'product' })}
              onEditInventory={() => openInventoryForm(product, { origin: 'product' })}
              onAddToCart={(qty) => addToCart(product, qty)}
              onReviewPurchase={reviewPurchase}
            />
          )}
          {screen === 'cart' && (
            <CartScreen
              cart={cart}
              unregistered={unregistered}
              total={cartTotal}
              onBack={goBack}
              onScan={() => openScanner('purchase', 'cart')}
              onScanCode={scanIntoSale}
              keepScanFocus={prefersUsbScanner()}
              onChangeQty={changeQty}
              onRemove={removeFromCart}
              onChangeUnregistered={changeUnregistered}
              onRemoveUnregistered={(barcode) => changeUnregistered(barcode, -Infinity)}
              onRegister={registerUnregistered}
              onFinalize={finalizePurchase}
              finalizing={purchaseFinalizing}
            />
          )}
          {screen === 'purchases' && <PurchasesScreen purchases={purchases} onBack={goBack} onScan={startNewPurchase} />}
          {screen === 'products' && (
            <ProductsScreen
              catalog={catalog}
              onBack={goBack}
              onAdd={() => openInventoryForm(null, { origin: 'products' })}
              onOpen={(item) => openProduct(item, 'products')}
              onEdit={(item) => openInventoryForm(item, { origin: 'products' })}
            />
          )}
          {screen === 'history' && (
            <HistoryScreen
              history={history}
              onBack={goBack}
              onLookup={scanLookup}
              onClear={clearScanHistory}
            />
          )}
          {screen === 'search' && (
            <SearchScreen
              catalog={catalog}
              onBack={goBack}
              onLookup={scanLookup}
              onOpenLocal={(item) => openProduct(item, 'search')}
              onScan={openScanner}
            />
          )}
          {screen === 'profile' && (
            <ProfileScreen
              catalog={catalog}
              purchases={purchases}
              onBack={goBack}
              onProducts={() => navigate('products')}
              onPurchases={() => navigate('purchases')}
              onHistory={() => navigate('history')}
              onInstall={install}
              onResetInventory={resetInventory}
              theme={theme}
              onThemeChange={onThemeChange}
            />
          )}
          {screen === 'inventory-form' && inventoryDraft && (
            <InventoryForm
              key={`${inventoryDraft.barcode}-${inventoryDraft.isEdit}`}
              initial={inventoryDraft}
              isEdit={Boolean(inventoryItem || inventoryDraft.isEdit)}
              onCancel={goBack}
              onSave={saveInventory}
            />
          )}
        </>
      )}

      {screen !== 'scanner' && screen !== 'product' && (
        <BottomNav
          active={navActive}
          onNavigate={navigate}
          purchaseNoticeCount={purchaseNoticeCount}
        />
      )}

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={navigate}
        onInstall={install}
        onLogout={logout}
        purchaseNoticeCount={purchaseNoticeCount}
        loggingOut={loggingOut}
      />
      {showInstallHelp && <InstallDialog onClose={() => setShowInstallHelp(false)} />}
      <Toast
        toast={toast}
        onAction={() => {
          if (!toast?.action) return;
          const target = toast.actionScreen || 'cart';
          setToast(null);
          if (target === 'scanner') {
            openScanner();
            return;
          }
          setBackScreen(screen === 'scanner' ? 'home' : screen);
          navigate('cart');
        }}
      />
    </div>
  );
}
