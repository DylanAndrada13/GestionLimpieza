import { sharedCatalogConfigured, supabaseRequest } from './shared-catalog.js';

// Online shop orders (tables web_orders / web_order_items, created by the shop's migrations).
// Stock changes happen inside the database functions, so this file never edits shop_products directly.
// Columns grow with the shop's migrations. The list is tried from the newest set down, so gestión
// keeps working on a database where a migration has not been run yet.
const BASE = 'id,order_number,user_id,customer_name,customer_email,pickup_point,payment_method,payment_status,order_status,currency,total_amount,created_at,paid_at,updated_at,mp_payment_id';
const CASH = 'stock_applied_at,stock_restored_at,stock_shortage,reviewed_at,delivered_at,status_note';
const CONTACT = 'customer_phone,customer_note';
const ITEMS = 'web_order_items(product_barcode,product_name,image_url,quantity,unit_price,line_total)';
const PICKUP = 'pickup_type,pickup_dates';
const PAYMENT = 'customer_dni,subtotal_amount,surcharge_amount,payment_confirmed_at';
const VARIANTS = [
  { fields: `${BASE},${CASH},${CONTACT},${PICKUP},${PAYMENT}`, migrated: true, contact: true, pickup: true, transfer: true },
  { fields: `${BASE},${CASH},${CONTACT},${PICKUP}`, migrated: true, contact: true, pickup: true },
  { fields: `${BASE},${CASH},${CONTACT}`, migrated: true, contact: true },
  { fields: `${BASE},${CASH}`, migrated: true, contact: false },
  { fields: BASE, migrated: false, contact: false },
  { fields: 'id,order_number,customer_name,customer_email,pickup_point,payment_method,payment_status,order_status,total_amount,created_at,paid_at', migrated: false, contact: false },
];
// Mercado Pago orders are saved before the buyer pays, so an abandoned checkout would sit in the
// list as "esperando pago". Gestión only shows them once the webhook (or the shop's reconciliation)
// marks them paid. Cash orders always show, because the local has to accept them.
const VISIBLE = 'or=(payment_method.neq.mercado_pago,payment_status.eq.paid)';
const ACTIONS = new Set(['accept', 'confirm_payment', 'ready', 'deliver', 'reject']);

const requireDatabase = () => {
  if (!sharedCatalogConfigured()) throw Object.assign(new Error('El servicio del local no está configurado. Avisá al responsable.'), { status: 503 });
};

// Ask the shop to re-check pending Mercado Pago payments (backup for missed webhooks) before
// listing. Throttled per instance; a failure never blocks the list.
// Read when used, so a value loaded from .env.local after this module was imported still applies.
const shopReconcileUrl = () => process.env.SHOP_RECONCILE_URL || 'https://perfumeria-cr.vercel.app/api/orders/reconcile';
const RECONCILE_EVERY_MS = 60000;
let lastShopReconcile = 0;
async function requestShopReconciliation() {
  if (Date.now() - lastShopReconcile < RECONCILE_EVERY_MS) return;
  lastShopReconcile = Date.now();
  await fetch(shopReconcileUrl(), { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => {});
}

export async function listWebOrders() {
  requireDatabase();
  await requestShopReconciliation();
  let lastError;
  for (const variant of VARIANTS) {
    try {
      const orders = await supabaseRequest(`web_orders?select=${variant.fields},${ITEMS}&${VISIBLE}&order=created_at.desc&limit=100`, { timeout: 10000 });
      return { orders: Array.isArray(orders) ? orders : [], available: true, migrated: variant.migrated, contact: variant.contact, pickup: Boolean(variant.pickup), transfer: Boolean(variant.transfer) };
    } catch (error) {
      if (error.status === 404) return { orders: [], available: false, migrated: false, contact: false };
      if (error.status !== 400) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function updateWebOrder(input) {
  requireDatabase();
  const orderId = String(input?.orderId || '');
  const action = String(input?.action || '');
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !ACTIONS.has(action)) throw Object.assign(new Error('Acción no válida.'), { status: 400 });
  try {
    const order = await supabaseRequest('rpc/set_web_order_status', {
      method: 'POST',
      body: JSON.stringify({ p_order_id: orderId, p_action: action, p_note: String(input?.note || '').slice(0, 300) || null }),
      timeout: 10000,
    });
    await notifyBuyer(orderId);
    return { order };
  } catch (error) {
    if (/invalid_transition/i.test(error.message)) throw Object.assign(new Error('El pedido cambió de estado. Actualizá la lista.'), { status: 409 });
    if (error.status === 404) throw Object.assign(new Error('Falta aplicar la migración de pedidos en Supabase.'), { status: 503 });
    throw error;
  }
}

// Asks the shop to send the buyer a push notice for the new status. Never fails the action.
async function notifyBuyer(orderId) {
  const key = process.env.SHOP_STAFF_API_KEY || '';
  if (!key) return;
  try {
    const response = await fetch(`${shopApiBase()}/api/push/order-status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-staff-key': key },
      body: JSON.stringify({ orderId }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error('Order push notice rejected:', response.status);
  } catch (error) { console.error('Order push notice failed:', error.message); }
}

// Latest money received by the seller account connected in the shop. The shop keeps the
// encrypted Mercado Pago token, so gestión asks the shop server to server with a shared key.
const shopApiBase = () => (process.env.SHOP_API_URL || new URL(shopReconcileUrl()).origin).replace(/\/$/, '');
export async function listMercadoPagoPayments(days = 7) {
  const key = process.env.SHOP_STAFF_API_KEY || '';
  if (!key) throw Object.assign(new Error('Falta configurar SHOP_STAFF_API_KEY en gestión (la misma clave que STAFF_API_KEY de la tienda).'), { status: 503 });
  const response = await fetch(`${shopApiBase()}/api/admin/mp/payments?days=${encodeURIComponent(days)}`, { headers: { 'x-staff-key': key }, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw Object.assign(new Error('La tienda rechazó la clave SHOP_STAFF_API_KEY. Revisá que coincida con STAFF_API_KEY de la tienda.'), { status: 503 });
  if (response.status === 404) throw Object.assign(new Error('La tienda todavía no tiene la consulta de cobros. Publicá la última versión de la tienda.'), { status: 503 });
  if (!response.ok) throw Object.assign(new Error(data.error || 'No se pudieron consultar los cobros de Mercado Pago.'), { status: 502 });
  return data;
}
