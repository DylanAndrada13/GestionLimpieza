import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Banknote, BellRing, CalendarDays, CheckCircle2, Copy, CreditCard, Landmark, Loader2, Mail, MapPin, MessageCircle,
  Phone, RefreshCw, Search, ShoppingBag, StickyNote, Store, X,
} from 'lucide-react';
import PrintTicket from './PrintTicket.jsx';

const money = value => `$${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};
export function timeAgo(value, now = Date.now()) {
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return '';
  const minutes = Math.round((now - date) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return dateTime(value);
}

const LOCAL_PICKUPS = ['Local Itatí', 'Local La Haya'];
const PICKUP_LABELS = { 'Maxi Carrefour': 'Maxi Carrefour (Camino Negro y Rodríguez)' };
const placeName = point => PICKUP_LABELS[point] || point;
export const pickupKind = order => order.pickup_type || (LOCAL_PICKUPS.includes(order.pickup_point) ? 'local' : 'encuentro');
const pickupDate = (iso, long = false) => new Intl.DateTimeFormat('es-AR', long ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const pickupDates = order => (Array.isArray(order.pickup_dates) ? order.pickup_dates : []).filter(Boolean).sort();

export const ORDER_LABEL = {
  pending_review: 'Nuevo, sin aceptar',
  transfer_review: 'Transferencia a verificar',
  awaiting_payment: 'Esperando pago',
  confirmed: 'Pagado, a preparar',
  preparing: 'En preparación',
  ready_for_pickup: 'Listo para retirar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};
const PAYMENT_LABEL = { pending: 'Sin pagar', pending_verification: 'Pago en revisión', paid: 'Pagado', failed: 'Pago rechazado o anulado', refunded: 'Devuelto' };
const METHOD_LABEL = { efectivo: 'Efectivo al retirar', mercado_pago: 'Mercado Pago', transferencia: 'Transferencia' };
// A transfer waiting for the local to check the money gets its own label.
export const statusKey = order => (order.payment_method === 'transferencia' && order.order_status === 'pending_review' ? 'transfer_review' : order.order_status);
const TONE = { transfer_review: 'new', pending_review: 'new', confirmed: 'new', preparing: 'work', ready_for_pickup: 'ready', delivered: 'done', cancelled: 'off', awaiting_payment: 'wait' };

// Orders the local has to act on: new cash orders and paid or accepted orders not delivered yet.
export const needsAttention = order => ['pending_review', 'confirmed', 'preparing', 'ready_for_pickup'].includes(order.order_status);

// Para atender: cash orders the local still has to accept and transfers to verify. Pagados: paid or accepted orders
// being prepared or waiting for pickup. Completados: delivered.
const FILTERS = [
  ['attention', 'Para atender', order => order.order_status === 'pending_review'],
  ['paid', 'Pagados', order => ['confirmed', 'preparing', 'ready_for_pickup'].includes(order.order_status)],
  ['done', 'Completados', order => order.order_status === 'delivered'],
  ['all', 'Todos', () => true],
];

function actionsFor(order) {
  const cash = order.payment_method === 'efectivo';
  if (order.payment_method === 'transferencia' && order.order_status === 'pending_review') return [['confirm_payment', 'Confirmar pago', 'primary'], ['reject', 'Rechazar', 'danger']];
  switch (order.order_status) {
    case 'pending_review': return [['accept', 'Aceptar pedido', 'primary'], ['reject', 'Rechazar', 'danger']];
    case 'confirmed': return [['deliver', 'Entregado', 'primary'], ['ready', 'Listo para retirar', 'secondary']];
    case 'preparing': return [['ready', 'Listo para retirar', 'primary'], ['deliver', cash ? 'Cobrado y entregado' : 'Entregado', 'secondary'], ...(cash ? [['reject', 'Cancelar pedido', 'danger']] : [])];
    case 'ready_for_pickup': return [['deliver', cash ? 'Cobrado y entregado' : 'Entregado', 'primary'], ...(cash ? [['reject', 'Cancelar pedido', 'danger']] : [])];
    default: return [];
  }
}

// Argentine numbers for a wa.me link: country 54, mobile 9, without the trunk 0.
function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('9')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 8 ? `549${digits}` : '';
}

function whatsappText(order) {
  const first = String(order.customer_name || '').split(' ')[0];
  const dates = pickupDates(order);
  const where = pickupKind(order) === 'local'
    ? `Ya lo podés retirar en ${placeName(order.pickup_point)}.`
    : dates.length === 1
      ? `Para el encuentro en ${placeName(order.pickup_point)} el ${pickupDate(dates[0])}. ¿A qué hora te queda mejor?`
      : `Para el encuentro en ${placeName(order.pickup_point)}${dates.length ? `, elegiste ${dates.map(d => pickupDate(d)).join(', ')}` : ''}. ¿Qué día y a qué hora te queda mejor?`;
  return `Hola ${first}, te escribimos de CR Perfumería por tu pedido ${order.order_number}. ${where}`;
}

// 'hoy', 'mañana' or 'el jueves 27 de noviembre', counted on the Argentine calendar (UTC-3). Null once the date passed.
function relativeDay(iso) {
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!iso || iso < today) return null;
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (iso === today) return 'hoy';
  if (iso === tomorrow) return 'mañana';
  return `el ${pickupDate(iso, true).replace(",", "")}`;
}

// Meeting-point sentence: the chosen date, or a request for another Thursday when it already passed.
function meetingLine(order, lead) {
  const dates = pickupDates(order);
  const upcoming = dates.map(relativeDay).find(Boolean);
  if (dates.length && !upcoming) return ' La fecha que elegiste ya pasó: ¿qué otro jueves te queda bien?';
  return ` ${lead} ${placeName(order.pickup_point)}${upcoming ? ` ${upcoming}` : ''}. ¿A qué hora te queda mejor?`;
}

// WhatsApp message for the buyer that matches the order's status, pickup and date.
export function statusWhatsappText(order) {
  const first = String(order.customer_name || '').split(' ')[0];
  const local = pickupKind(order) === 'local';
  if (['preparing', 'confirmed'].includes(order.order_status)) {
    const tail = local ? ` Te avisamos cuando esté listo para retirar en ${placeName(order.pickup_point)}.` : meetingLine(order, 'Te lo llevamos al encuentro en');
    return `¡Hola ${first}! Tu pedido ${order.order_number} de CR Perfumería ya está en preparación.${tail}`;
  }
  if (order.order_status === 'ready_for_pickup') {
    if (local) return `¡Hola ${first}! Tu pedido ${order.order_number} ya está listo. Podés pasar a retirarlo por ${placeName(order.pickup_point)} en el horario de atención.`;
    const line = meetingLine(order, 'ya está listo para el encuentro en');
    return line.startsWith(' La fecha') ? `¡Hola ${first}! Tu pedido ${order.order_number} ya está listo.${line}` : `¡Hola ${first}! Tu pedido ${order.order_number}${line}`;
  }
  return whatsappText(order);
}

// Message for the buyer once the local confirmed the transfer.
export function paidWhatsappText(order) {
  const first = String(order.customer_name || '').split(' ')[0];
  const where = pickupKind(order) === 'local'
    ? `Te avisamos cuando esté listo para retirar en ${placeName(order.pickup_point)}.`
    : `Te escribimos para confirmar el día y la hora del encuentro en ${placeName(order.pickup_point)}.`;
  return `¡Hola ${first}! Recibimos tu transferencia de ${money(order.total_amount)} por el pedido ${order.order_number} de CR Perfumería. Ya lo estamos preparando. ${where}`;
}

function orderSummary(order) {
  const lines = (order.web_order_items || []).map(item => `• ${item.quantity} × ${item.product_name} (${money(item.line_total ?? item.quantity * item.unit_price)})`);
  return [
    `Pedido ${order.order_number}`,
    `${order.customer_name}${order.customer_phone ? ` · ${order.customer_phone}` : ''}`,
    `${pickupKind(order) === 'local' ? 'Retira en' : 'Punto de encuentro:'} ${placeName(order.pickup_point)}`,
    ...(pickupDates(order).length ? [`${pickupDates(order).length === 1 ? 'Fecha de entrega' : 'Fechas posibles'}: ${pickupDates(order).map(d => pickupDate(d)).join(', ')}`] : []),
    ...lines,
    `Total ${money(order.total_amount)} · ${METHOD_LABEL[order.payment_method] || order.payment_method} · ${PAYMENT_LABEL[order.payment_status] || order.payment_status}`,
  ].join('\n');
}

function StatusChip({ order }) {
  const status = statusKey(order);
  return <span className={`mg-chip tone-${TONE[status] || 'wait'}`}><i />{ORDER_LABEL[status] || status}</span>;
}

function OrderRow({ order, selected, onSelect, now }) {
  const units = (order.web_order_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return (
    <button type="button" className={`mg-order-row ${selected ? 'is-selected' : ''} ${order.order_status === 'pending_review' ? 'is-new' : ''}`} onClick={() => onSelect(order.id)} aria-current={selected ? 'true' : undefined}>
      <span className="mg-order-row-top"><StatusChip order={order} /><time dateTime={order.created_at}>{timeAgo(order.created_at, now)}</time></span>
      <strong className="mg-order-row-name">{order.customer_name || order.customer_email}</strong>
      <span className="mg-order-row-meta">
        <span>{units} {units === 1 ? 'unidad' : 'unidades'} · {pickupKind(order) === 'local' ? '' : 'Encuentro en '}{placeName(order.pickup_point)}</span>
        <b>{money(order.total_amount)}</b>
      </span>
      <span className="mg-order-row-code">{order.order_number} · {order.payment_method === 'efectivo' ? 'Efectivo' : order.payment_method === 'transferencia' ? 'Transferencia' : 'Mercado Pago'}</span>
    </button>
  );
}

function Timeline({ order }) {
  const steps = [
    ['Pedido hecho', order.created_at],
    order.reviewed_at && !order.payment_confirmed_at && [order.order_status === 'cancelled' && !order.delivered_at ? 'Revisado por el local' : 'Aceptado por el local', order.reviewed_at],
    order.paid_at && [order.payment_method === 'transferencia' ? 'Transferencia confirmada por el local' : 'Pago confirmado', order.paid_at],
    order.delivered_at && ['Entregado', order.delivered_at],
    order.stock_restored_at && ['Stock devuelto al inventario', order.stock_restored_at],
  ].filter(Boolean).sort((a, b) => new Date(a[1]) - new Date(b[1]));
  return <ol className="mg-timeline">{steps.map(([label, at]) => <li key={label}><span>{label}</span><time dateTime={at}>{dateTime(at)}</time></li>)}</ol>;
}

function OrderTicket({ order, contactAvailable, pickupInfo, working, onAction, onClose }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setRejecting(false); setNote(''); setCopied(false); }, [order.id]);

  const cash = order.payment_method === 'efectivo';
  const transfer = order.payment_method === 'transferencia';
  const transferPending = transfer && order.order_status === 'pending_review';
  const transferPaid = transfer && order.payment_status === 'paid' && !['delivered', 'cancelled'].includes(order.order_status);
  const items = order.web_order_items || [];
  const units = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const wa = whatsappNumber(order.customer_phone);
  const actions = actionsFor(order);
  const copy = async () => {
    try { await navigator.clipboard.writeText(orderSummary(order)); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch { }
  };

  return (
    <article className="mg-ticket" aria-labelledby="mg-ticket-title">
      <header className="mg-ticket-head">
        <div>
          <h2 id="mg-ticket-title">{order.order_number}</h2>
          <p>Hecho el {dateTime(order.created_at)}</p>
        </div>
        <div className="mg-ticket-head-side">
          <StatusChip order={order} />
          <button type="button" className="mg-icon-btn mg-ticket-close" onClick={onClose} aria-label="Cerrar detalle"><X size={18} /></button>
        </div>
      </header>

      {order.order_status === 'pending_review' && order.payment_method !== 'transferencia' && <div className="mg-notice tone-new"><BellRing size={17} />Pedido nuevo en efectivo. El stock ya está reservado: aceptalo para prepararlo o rechazalo para devolverlo.</div>}
      {transferPending && <div className="mg-notice tone-new"><Landmark size={17} />Transferencia a verificar. Revisá en la app de Mercado Pago que hayan entrado <b>{money(order.total_amount)}</b> de {order.customer_name}{order.customer_dni ? ` (DNI ${order.customer_dni})` : ''}. Si llegó, tocá Confirmar pago. El stock ya está reservado.</div>}
      {transferPaid && wa && order.order_status !== 'ready_for_pickup' && <div className="mg-notice tone-new"><CheckCircle2 size={17} />Transferencia confirmada. Avisale al comprador: <a className="mg-wa" href={`https://wa.me/${wa}?text=${encodeURIComponent(paidWhatsappText(order))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Enviar WhatsApp de pago recibido</a></div>}
      {wa && ['preparing', 'confirmed', 'ready_for_pickup'].includes(order.order_status) && !(transferPaid && order.order_status !== 'ready_for_pickup') && <div className="mg-notice tone-new"><MessageCircle size={17} />{order.order_status === 'ready_for_pickup' ? 'Pedido listo.' : 'Pedido en preparación.'} <a className="mg-wa" href={`https://wa.me/${wa}?text=${encodeURIComponent(statusWhatsappText(order))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Avisar al cliente por WhatsApp</a></div>}
      {order.stock_shortage?.length > 0 && <div className="mg-notice tone-danger"><AlertTriangle size={17} />Faltó stock al descontar {order.stock_shortage.length === 1 ? 'un producto' : `${order.stock_shortage.length} productos`}: {order.stock_shortage.map(s => `${s.barcode} (pedido ${s.requested}, había ${s.available})`).join(', ')}.</div>}
      {order.status_note && <div className="mg-notice"><StickyNote size={17} />Motivo registrado: {order.status_note}</div>}

      <section className="mg-ticket-block">
        <h3>Comprador</h3>
        <p className="mg-buyer-name">{order.customer_name}</p>
        {order.customer_dni && <p className="mg-muted">DNI {order.customer_dni}</p>}
        <ul className="mg-contact">
          <li><Mail size={15} /><a href={`mailto:${order.customer_email}?subject=${encodeURIComponent(`Tu pedido ${order.order_number}`)}`}>{order.customer_email}</a></li>
          {order.customer_phone
            ? <li><Phone size={15} /><a href={`tel:${String(order.customer_phone).replace(/[^\d+]/g, '')}`}>{order.customer_phone}</a>{wa && <a className="mg-wa" href={`https://wa.me/${wa}?text=${encodeURIComponent(statusWhatsappText(order))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>}</li>
            : <li className="is-muted"><Phone size={15} />{contactAvailable ? 'No dejó teléfono (pedido anterior al cambio)' : 'Teléfono no disponible: falta correr la migración de contacto en Supabase'}</li>}
        </ul>
        {order.customer_note && <blockquote className="mg-buyer-note">{order.customer_note}</blockquote>}
      </section>

      <section className="mg-ticket-block">
        <h3>Retiro</h3>
        <p className="mg-pickup">{pickupKind(order) === 'local' ? <Store size={17} /> : <MapPin size={17} />}<span><strong>{placeName(order.pickup_point)}</strong><small>{pickupKind(order) === 'local' ? 'Retiro en el local, en horario de atención' : (pickupDates(order).length > 1 ? 'Punto de encuentro: confirmale por WhatsApp una de las fechas y la hora' : 'Punto de encuentro: confirmale por WhatsApp la hora')}</small></span></p>
        {pickupDates(order).length > 0 && (
          <ul className="mg-pickup-dates" aria-label={pickupDates(order).length === 1 ? 'Fecha de entrega que eligió el comprador' : 'Fechas posibles que eligió el comprador'}>
            {pickupDates(order).map(date => <li key={date}><CalendarDays size={15} />{pickupDate(date, true)}</li>)}
          </ul>
        )}
        {pickupKind(order) === 'encuentro' && !pickupDates(order).length && <p className="mg-pickup-missing">{pickupInfo ? 'El comprador no dejó fecha (pedido anterior al cambio).' : 'Para ver la fecha que eligió, corré en Supabase la migración 202611220004 de la tienda.'}</p>}
      </section>

      <section className="mg-ticket-block">
        <h3>Productos <span>{units} {units === 1 ? 'unidad' : 'unidades'}</span></h3>
        <table className="mg-ticket-items">
          <thead><tr><th scope="col">Cant.</th><th scope="col">Producto</th><th scope="col">Precio</th><th scope="col">Subtotal</th></tr></thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.product_barcode}-${index}`}>
                <td className="mg-qty">{item.quantity}</td>
                <td><span className="mg-item-name">{item.product_name}</span>{item.product_barcode && <small>{item.product_barcode}</small>}</td>
                <td className="mg-num">{money(item.unit_price)}</td>
                <td className="mg-num">{money(item.line_total ?? item.quantity * item.unit_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Number(order.surcharge_amount) > 0 && <tr><th scope="row" colSpan="3">Recargo pago online</th><td className="mg-num">{money(order.surcharge_amount)}</td></tr>}
            <tr><th scope="row" colSpan="3">Total</th><td className="mg-num">{money(order.total_amount)}</td></tr>
          </tfoot>
        </table>
      </section>

      <section className="mg-ticket-block mg-ticket-pay">
        <h3>Pago</h3>
        <dl>
          <div><dt>Medio</dt><dd>{cash ? <Banknote size={15} /> : transfer ? <Landmark size={15} /> : <CreditCard size={15} />}{METHOD_LABEL[order.payment_method] || order.payment_method}</dd></div>
          <div><dt>Estado</dt><dd className={order.payment_status === 'paid' ? 'is-ok' : order.payment_status === 'failed' ? 'is-bad' : ''}>{order.payment_status === 'paid' && <CheckCircle2 size={15} />}{cash && order.payment_status === 'pending' ? 'A cobrar al retirar' : PAYMENT_LABEL[order.payment_status] || order.payment_status}</dd></div>
          {order.paid_at && <div><dt>Pagado</dt><dd>{dateTime(order.paid_at)}</dd></div>}
          {order.mp_payment_id && <div><dt>Operación MP</dt><dd className="mg-code">{order.mp_payment_id}</dd></div>}
          {Number(order.surcharge_amount) > 0 && <div><dt>Recargo</dt><dd>{money(order.surcharge_amount)} por pago online</dd></div>}
          <div><dt>Stock</dt><dd>{order.stock_restored_at ? 'Devuelto al inventario' : order.stock_applied_at ? 'Descontado del inventario' : order.payment_method === 'mercado_pago' ? 'Se descuenta cuando se confirma el pago' : 'Sin descontar'}</dd></div>
        </dl>
      </section>

      <section className="mg-ticket-block">
        <h3>Ticket de compra</h3>
        <PrintTicket order={order} />
      </section>

      <section className="mg-ticket-block">
        <h3>Historial</h3>
        <Timeline order={order} />
      </section>

      <footer className="mg-ticket-actions">
        {rejecting ? (
          <form className="mg-reject" onSubmit={event => { event.preventDefault(); onAction(order, 'reject', note); }}>
            <label htmlFor="mg-reject-note">Motivo (opcional, queda guardado en el pedido)</label>
            <input id="mg-reject-note" value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="Por ejemplo, no pasó a retirarlo" autoFocus />
            <div>
              <button type="button" className="mg-btn ghost" onClick={() => setRejecting(false)}>Volver</button>
              <button type="submit" className="mg-btn danger" disabled={Boolean(working)}>{working === `${order.id}:reject` && <Loader2 size={16} className="mg-spin" />}{order.order_status === 'pending_review' ? 'Rechazar y devolver stock' : 'Cancelar y devolver stock'}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="mg-ticket-actions-main">
              {actions.map(([action, label, tone]) => (
                <button key={action} type="button" className={`mg-btn ${tone === 'primary' ? 'primary' : tone === 'danger' ? 'danger-ghost' : 'ghost'}`} disabled={Boolean(working)} onClick={() => (action === 'reject' ? setRejecting(true) : onAction(order, action))}>
                  {working === `${order.id}:${action}` && <Loader2 size={16} className="mg-spin" />}{label}
                </button>
              ))}
              {!actions.length && <span className="mg-muted">{order.order_status === 'awaiting_payment' ? 'Esperando que Mercado Pago confirme el pago. No hay nada para hacer todavía.' : 'Pedido cerrado.'}</span>}
            </div>
            <button type="button" className="mg-btn ghost" onClick={copy}>{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}{copied ? 'Copiado' : 'Copiar resumen'}</button>
          </>
        )}
      </footer>
    </article>
  );
}

export default function WebOrdersPage({ data, loading, error, onRefresh, onAction, working, notificationsEnabled, onEnableNotifications, selectedId, onSelect, lastLoaded }) {
  const [filter, setFilter] = useState('attention');
  const [term, setTerm] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const orders = data?.orders || [];
  const visible = useMemo(() => {
    const test = FILTERS.find(([id]) => id === filter)?.[2] || (() => true);
    const query = term.trim().toLocaleLowerCase('es');
    const list = orders.filter(order => test(order) && (!query || [order.order_number, order.customer_name, order.customer_email, order.customer_phone, order.customer_dni, order.pickup_point, ...pickupDates(order)].some(value => String(value || '').toLocaleLowerCase('es').includes(query))));
    // To attend: new ones first, then oldest first so nobody waits twice. Other views: newest first.
    return filter === 'attention' ? [...list].sort((a, b) => (a.order_status === 'pending_review' ? 0 : 1) - (b.order_status === 'pending_review' ? 0 : 1) || new Date(a.created_at) - new Date(b.created_at)) : list;
  }, [orders, filter, term]);
  const selected = orders.find(order => order.id === selectedId) || null;

  return (
    <div className="mg-page mg-orders-page">
      <div className="mg-page-head">
        <div>
          <h1>Pedidos online</h1>
          <p>Pedidos de la tienda web. Se revisan solos cada 30 segundos{lastLoaded ? `; última revisión ${timeAgo(lastLoaded, now)}` : ''}.</p>
        </div>
        <div className="mg-page-actions">
          {notificationsEnabled === false && <button type="button" className="mg-btn ghost" onClick={onEnableNotifications}><BellRing size={16} /> Activar avisos</button>}
          <button type="button" className="mg-btn ghost" onClick={onRefresh} disabled={loading}>{loading ? <Loader2 size={16} className="mg-spin" /> : <RefreshCw size={16} />} Revisar ahora</button>
        </div>
      </div>

      {data && !data.available && <div className="mg-notice tone-danger"><AlertTriangle size={17} />Todavía no existen las tablas de pedidos online en Supabase.</div>}
      {data?.available && !data.migrated && <div className="mg-notice tone-danger"><AlertTriangle size={17} />Falta correr la migración de pedidos en efectivo y stock en Supabase. Hasta entonces no se pueden aceptar ni cerrar pedidos desde acá.</div>}
      {data?.available && data.migrated && data.contact === false && <div className="mg-notice"><AlertTriangle size={17} />Para ver el teléfono y la nota del comprador, corré en Supabase la migración 202611220003 de la tienda.</div>}
      {data?.available && data.contact && data.pickup === false && <div className="mg-notice"><AlertTriangle size={17} />Para ver si retiran en el local o en un punto de encuentro, y la fecha de entrega que eligieron, corré en Supabase la migración 202611220004 de la tienda.</div>}
      {data?.available && data.pickup && data.transfer === false && <div className="mg-notice"><AlertTriangle size={17} />Para recibir pagos por transferencia y ver el recargo online, corré en Supabase la migración 202611250001 de la tienda.</div>}
      {error && <div className="mg-notice tone-danger"><AlertTriangle size={17} />{error}</div>}


      <div className="mg-toolbar">
        <div className="mg-tabs" role="tablist" aria-label="Filtrar pedidos">
          {FILTERS.map(([id, label, test]) => {
            const count = id === 'all' ? null : orders.filter(test).length;
            return <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}{count ? <b>{count}</b> : null}</button>;
          })}
        </div>
        <label className="mg-search"><Search size={16} /><input value={term} onChange={event => setTerm(event.target.value)} placeholder="Buscar por nombre, mail, teléfono o número" aria-label="Buscar pedidos" /></label>
      </div>

      <div className={`mg-orders-split ${selected ? 'has-selection' : ''}`}>
        <div className="mg-order-list">
          {loading && !data && <div className="mg-empty"><Loader2 size={22} className="mg-spin" /><p>Cargando pedidos…</p></div>}
          {data && visible.length === 0 && <div className="mg-empty"><ShoppingBag size={24} /><p>{term ? 'Ningún pedido coincide con la búsqueda.' : filter === 'attention' ? 'No hay pedidos en efectivo ni transferencias para confirmar. Cuando entre uno, suena un aviso.' : 'No hay pedidos en esta vista.'}</p></div>}
          {visible.map(order => <OrderRow key={order.id} order={order} selected={order.id === selectedId} onSelect={onSelect} now={now} />)}
        </div>
        <div className="mg-order-detail">
          {selected
            ? <OrderTicket order={selected} contactAvailable={data?.contact !== false} pickupInfo={data?.pickup !== false} working={working} onAction={onAction} onClose={() => onSelect('')} />
            : <div className="mg-empty mg-detail-empty"><ShoppingBag size={26} /><p>Elegí un pedido de la lista para ver el comprador, los productos y el pago.</p></div>}
        </div>
      </div>
    </div>
  );
}
