import { sharedCatalogConfigured, supabaseRequest } from './shared-catalog.js';

const requireDatabase = () => {
  if (!sharedCatalogConfigured()) throw Object.assign(new Error('La conexión a Supabase no está configurada.'), { status: 503 });
};

export const productFromRow = row => ({
  barcode: row.barcode,
  barcodes: row.barcodes || [row.barcode],
  name: row.name,
  brand: row.brand || '',
  category: row.category || '',
  quantity: row.quantity || '',
  image: row.image_url || '',
  price: Number(row.price) || 0,
  stock: Number(row.stock) || 0,
  source: 'Mi inventario',
  updatedAt: row.updated_at,
});

const purchaseFromRow = row => ({
  id: row.id,
  at: row.occurred_at,
  total: Number(row.total) || 0,
  units: Number(row.units) || 0,
  items: Array.isArray(row.items) ? row.items : [],
});

const scanFromRow = row => ({ barcode: row.barcode, at: row.scanned_at, found: row.found, name: row.name || '' });

export async function getShopState() {
  requireDatabase();
  const [products, cart, purchases, scans] = await Promise.all([
    supabaseRequest('shop_products?select=barcode,barcodes,name,brand,category,quantity,image_url,price,stock,updated_at&order=name.asc'),
    supabaseRequest('shop_cart?select=items&id=eq.current&limit=1'),
    supabaseRequest('shop_purchases?select=id,occurred_at,total,units,items&order=occurred_at.desc&limit=120'),
    supabaseRequest('shop_scan_history?select=barcode,scanned_at,found,name&order=scanned_at.desc&limit=24'),
  ]);
  return {
    catalog: (products || []).map(productFromRow),
    cart: Array.isArray(cart?.[0]?.items) ? cart[0].items : [],
    purchases: (purchases || []).map(purchaseFromRow),
    history: (scans || []).map(scanFromRow),
  };
}

export async function saveShopProduct(input) {
  requireDatabase();
  const barcode = String(input?.barcode || '').replace(/\s/g, '');
  const name = String(input?.name || '').trim();
  const price = Number(input?.price);
  const stock = Math.floor(Number(input?.stock));
  if (!/^\d{8,14}$/.test(barcode)) throw Object.assign(new Error('Ingresá un EAN o UPC válido.'), { status: 400 });
  if (name.length < 2) throw Object.assign(new Error('Ingresá el nombre del producto.'), { status: 400 });
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) throw Object.assign(new Error('El precio y el stock deben ser valores válidos.'), { status: 400 });
  const barcodes = [...new Set([barcode, ...(Array.isArray(input.barcodes) ? input.barcodes : [])].map(String).filter(code => /^\d{8,14}$/.test(code)))];
  const rows = await supabaseRequest('shop_products?on_conflict=barcode', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      barcode,
      barcodes,
      name: name.slice(0, 180),
      brand: String(input.brand || '').trim().slice(0, 100),
      category: String(input.category || '').trim().slice(0, 100),
      quantity: String(input.quantity || '').trim().slice(0, 80),
      image_url: String(input.image || '').trim().slice(0, 1500) || null,
      price: Math.round(price * 100) / 100,
      stock,
      updated_at: new Date().toISOString(),
    }),
  });
  return productFromRow(rows[0]);
}

export async function resetShopInventory() {
  requireDatabase();
  await supabaseRequest('rpc/reset_shop_inventory', { method: 'POST', body: '{}' });
}

export async function saveShopCart(inputItems) {
  requireDatabase();
  if (!Array.isArray(inputItems) || inputItems.length > 200) throw Object.assign(new Error('El carrito tiene demasiados productos.'), { status: 400 });
  const items = inputItems.map(item => ({
    barcode: String(item?.barcode || ''),
    name: String(item?.name || 'Producto').slice(0, 180),
    brand: String(item?.brand || '').slice(0, 100),
    quantity: String(item?.quantity || '').slice(0, 80),
    image: String(item?.image || '').slice(0, 1500),
    price: Math.max(0, Number(item?.price) || 0),
    stock: Math.max(0, Math.floor(Number(item?.stock) || 0)),
    qty: Math.max(1, Math.floor(Number(item?.qty) || 1)),
  }));
  if (items.some(item => !/^\d{8,14}$/.test(item.barcode))) throw Object.assign(new Error('El carrito contiene un EAN inválido.'), { status: 400 });
  await supabaseRequest('shop_cart?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'current', items, updated_at: new Date().toISOString() }),
  });
  return items;
}

export async function recordShopScan(input) {
  requireDatabase();
  const barcode = String(input?.barcode || '').replace(/\s/g, '');
  if (!/^\d{8,14}$/.test(barcode)) throw Object.assign(new Error('Código de barras inválido.'), { status: 400 });
  const rows = await supabaseRequest('shop_scan_history?on_conflict=barcode', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ barcode, scanned_at: new Date().toISOString(), found: input.found ?? null, name: String(input.name || '').slice(0, 180) }),
  });
  return scanFromRow(rows[0]);
}

export async function clearShopHistory() {
  requireDatabase();
  await supabaseRequest('shop_scan_history?barcode=not.is.null', { method: 'DELETE' });
}

export async function recordShopPurchase(inputItems) {
  requireDatabase();
  if (!Array.isArray(inputItems) || inputItems.length === 0 || inputItems.length > 200) throw Object.assign(new Error('La compra no tiene productos válidos.'), { status: 400 });
  const items = inputItems.map(item => ({
    barcode: String(item?.barcode || ''),
    name: String(item?.name || 'Producto').slice(0, 180),
    brand: String(item?.brand || '').slice(0, 100),
    quantity: String(item?.quantity || '').slice(0, 80),
    image: String(item?.image || '').slice(0, 1500),
    price: Number(item?.price) || 0,
    qty: Math.floor(Number(item?.qty) || 0),
  }));
  const purchase = await supabaseRequest('rpc/record_shop_purchase', { method: 'POST', body: JSON.stringify({ p_items: items }) });
  const products = await supabaseRequest('shop_products?select=barcode,barcodes,name,brand,category,quantity,image_url,price,stock,updated_at&order=name.asc');
  return {
    purchase: purchaseFromRow(purchase),
    catalog: (products || []).map(productFromRow),
  };
}
