import { sharedCatalogConfigured, supabaseRequest } from './shared-catalog.js';

// Online shop orders (tables web_orders / web_order_items, created by the shop's migrations).
// Stock changes happen inside the database functions, so this file never edits shop_products directly.
const FIELDS = 'id,order_number,customer_name,customer_email,pickup_point,payment_method,payment_status,order_status,total_amount,created_at,paid_at,stock_shortage,web_order_items(product_barcode,product_name,quantity,unit_price,line_total)';
const ACTIONS = new Set(['accept', 'ready', 'deliver', 'reject']);

const requireDatabase = () => {
  if (!sharedCatalogConfigured()) throw Object.assign(new Error('El servicio del local no está configurado. Avisá al responsable.'), { status: 503 });
};

export async function listWebOrders() {
  requireDatabase();
  const load = fields => supabaseRequest(`web_orders?select=${fields}&order=created_at.desc&limit=80`, { timeout: 10000 });
  try {
    const orders = await load(FIELDS);
    return { orders: Array.isArray(orders) ? orders : [], available: true, migrated: true };
  } catch (error) {
    if (error.status === 404) return { orders: [], available: false, migrated: false };
    if (error.status !== 400) throw error;
    // Before the cash/stock migration the stock_shortage column does not exist yet.
    const orders = await load(FIELDS.replace(',stock_shortage', ''));
    return { orders: Array.isArray(orders) ? orders : [], available: true, migrated: false };
  }
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
