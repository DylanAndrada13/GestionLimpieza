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
const VARIANTS = [
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
const ACTIONS = new Set(['accept', 'ready', 'deliver', 'reject']);

const requireDatabase = () => {
  if (!sharedCatalogConfigured()) throw Object.assign(new Error('El servicio del local no está configurado. Avisá al responsable.'), { status: 503 });
};

export async function listWebOrders() {
  requireDatabase();
  let lastError;
  for (const variant of VARIANTS) {
    try {
      const orders = await supabaseRequest(`web_orders?select=${variant.fields},${ITEMS}&${VISIBLE}&order=created_at.desc&limit=100`, { timeout: 10000 });
      return { orders: Array.isArray(orders) ? orders : [], available: true, migrated: variant.migrated, contact: variant.contact, pickup: Boolean(variant.pickup) };
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
    return { order };
  } catch (error) {
    if (/invalid_transition/i.test(error.message)) throw Object.assign(new Error('El pedido cambió de estado. Actualizá la lista.'), { status: 409 });
    if (error.status === 404) throw Object.assign(new Error('Falta aplicar la migración de pedidos en efectivo en Supabase.'), { status: 503 });
    throw error;
  }
}
