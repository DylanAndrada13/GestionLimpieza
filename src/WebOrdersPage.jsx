import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, BellRing, CheckCircle2, Clock3, Globe, Loader2, MapPin, RefreshCw } from 'lucide-react';

const money = value => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

export const ORDER_LABEL = {
  pending_review: 'Nuevo, sin aceptar',
  awaiting_payment: 'Esperando pago',
  confirmed: 'Pagado, a preparar',
  preparing: 'En preparación',
  ready_for_pickup: 'Listo para retirar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

// Orders the local has to act on: new cash orders and paid or accepted orders not delivered yet.
export const needsAttention = order => ['pending_review', 'confirmed', 'preparing', 'ready_for_pickup'].includes(order.order_status);
const isClosed = order => ['delivered', 'cancelled'].includes(order.order_status) || (order.order_status === 'awaiting_payment');

const FILTERS = [
  ['attention', 'Para atender'],
  ['pending_review', 'Nuevos'],
  ['closed', 'Cerrados y sin pagar'],
  ['all', 'Todos'],
];

function actionsFor(order) {
  const cash = order.payment_method === 'efectivo';
  switch (order.order_status) {
    case 'pending_review': return [['accept', 'Aceptar pedido', 'primary'], ['reject', 'Rechazar', 'danger']];
    case 'confirmed': return [['ready', 'Listo para retirar', 'secondary'], ['deliver', 'Entregado', 'primary']];
    case 'preparing': return [['ready', 'Listo para retirar', 'secondary'], ['deliver', cash ? 'Cobrado y entregado' : 'Entregado', 'primary'], ...(cash ? [['reject', 'Cancelar', 'danger']] : [])];
    case 'ready_for_pickup': return [['deliver', cash ? 'Cobrado y entregado' : 'Entregado', 'primary'], ...(cash ? [['reject', 'Cancelar', 'danger']] : [])];
    default: return [];
  }
}

export default function WebOrdersPage({ data, loading, error, onRefresh, onAction, working, notificationsEnabled, onEnableNotifications }) {
  const [filter, setFilter] = useState('attention');
  const orders = data?.orders || [];
  const newCount = orders.filter(order => order.order_status === 'pending_review').length;
  const visible = useMemo(() => orders.filter(order => (
    filter === 'all' ? true
      : filter === 'pending_review' ? order.order_status === 'pending_review'
        : filter === 'closed' ? isClosed(order)
          : needsAttention(order)
  )), [orders, filter]);

  return (
    <>
      <div className="management-page-heading">
        <div><span className="management-eyebrow">Tienda online</span><h1>Pedidos online</h1><p>Pedidos hechos desde la tienda web. Se actualizan solos cada 30 segundos.</p></div>
        <div className="web-orders-heading-actions">
          {notificationsEnabled === false && <button type="button" className="management-secondary" onClick={onEnableNotifications}><BellRing size={17} /> Activar avisos</button>}
          <button type="button" className="management-secondary" onClick={onRefresh} disabled={loading}>{loading ? <Loader2 size={17} className="management-spin" /> : <RefreshCw size={17} />} Actualizar</button>
        </div>
      </div>

      {data && !data.available && <div className="web-orders-notice warning"><AlertTriangle size={18} />Todavía no existen las tablas de pedidos online en Supabase.</div>}
      {data?.available && !data.migrated && <div className="web-orders-notice warning"><AlertTriangle size={18} />Falta correr la migración de pedidos en efectivo y stock en Supabase. Hasta entonces no se pueden aceptar ni cerrar pedidos desde acá.</div>}
      {error && <div className="web-orders-notice danger"><AlertTriangle size={18} />{error}</div>}
      {newCount > 0 && <div className="web-orders-notice gold"><Bell size={18} />Tenés {newCount} {newCount === 1 ? 'pedido nuevo en efectivo' : 'pedidos nuevos en efectivo'} para aceptar o rechazar. El stock ya quedó reservado.</div>}

      <div className="web-orders-filters" role="tablist" aria-label="Filtrar pedidos">
        {FILTERS.map(([value, label]) => {
          const count = value === 'pending_review' ? newCount : value === 'attention' ? orders.filter(needsAttention).length : null;
          return <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}{count ? <b>{count}</b> : null}</button>;
        })}
      </div>

      {loading && !data && <div className="web-orders-empty"><Loader2 size={24} className="management-spin" /><p>Cargando pedidos…</p></div>}
      {data && visible.length === 0 && <div className="web-orders-empty"><Globe size={26} /><p>{filter === 'attention' ? 'No hay pedidos para atender ahora.' : 'No hay pedidos en esta vista.'}</p></div>}

      <section className="web-orders-grid">
        {visible.map(order => {
          const cash = order.payment_method === 'efectivo';
          return (
            <article key={order.id} className={`management-panel web-order ${order.order_status === 'pending_review' ? 'is-new' : ''}`}>
              <header>
                <div><strong>{order.order_number}</strong><small><Clock3 size={13} /> {dateTime(order.created_at)}</small></div>
                <span className={`web-order-status ${order.order_status}`}>{ORDER_LABEL[order.order_status] || order.order_status}</span>
              </header>
              <p className="web-order-customer"><strong>{order.customer_name}</strong><span>{order.customer_email}</span></p>
              <p className="web-order-pickup"><MapPin size={15} /> Retira en {order.pickup_point}</p>
              <ul className="web-order-items">
                {(order.web_order_items || []).map((item, index) => <li key={`${item.product_barcode}-${index}`}><span>{item.quantity} ×</span> {item.product_name}<em>{money(item.line_total ?? item.quantity * item.unit_price)}</em></li>)}
              </ul>
              {order.stock_shortage?.length > 0 && <div className="web-orders-notice danger small"><AlertTriangle size={16} />Faltó stock de {order.stock_shortage.length === 1 ? 'un producto' : `${order.stock_shortage.length} productos`} al descontar. Revisalo antes de prepararlo.</div>}
              <footer>
                <span className={`web-order-pay ${order.payment_status === 'paid' ? 'paid' : ''}`}>{order.payment_status === 'paid' ? <CheckCircle2 size={15} /> : null}{cash ? 'Efectivo al retirar' : 'Mercado Pago'} · {order.payment_status === 'paid' ? 'pagado' : order.payment_status === 'failed' ? 'sin pago' : 'a cobrar'}</span>
                <strong>{money(order.total_amount)}</strong>
              </footer>
              {actionsFor(order).length > 0 && (
                <div className="web-order-actions">
                  {actionsFor(order).map(([action, label, tone]) => (
                    <button key={action} type="button" className={tone === 'primary' ? 'management-primary' : tone === 'danger' ? 'management-secondary danger' : 'management-secondary'} disabled={Boolean(working)} onClick={() => onAction(order, action)}>
                      {working === `${order.id}:${action}` ? <Loader2 size={16} className="management-spin" /> : null}{label}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
