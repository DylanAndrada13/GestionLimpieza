import { sharedCatalogConfigured, supabaseRequest } from './shared-catalog.js';

const PRODUCT_FIELDS = 'barcode,barcodes,name,brand,category,quantity,image_url,price,stock,updated_at';

const requireDatabase = () => {
  if (!sharedCatalogConfigured()) throw Object.assign(new Error('El servicio del local no está configurado. Avisá al responsable.'), { status: 503 });
};

export const productFromRow = row => ({
  barcode: row.barcode,
  barcodes: Array.isArray(row.barcodes) && row.barcodes.length ? row.barcodes : [row.barcode],
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

async function fetchShopProducts() {
  // PostgREST recorta cada respuesta a la cantidad máxima configurada en el
  // proyecto. Se pide por páginas para no perder productos en inventarios grandes.
  const pageSize = 1000;
  const products = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest(`shop_products?select=${PRODUCT_FIELDS}&order=name.asc,barcode.asc&limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page) || page.length === 0) break;
    products.push(...page);
    if (page.length < pageSize) break;
  }
  return products;
}

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
  const [products, cart] = await Promise.all([
    fetchShopProducts(),
    supabaseRequest('shop_cart?select=items&id=eq.current&limit=1'),
  ]);
  return {
    catalog: products.map(productFromRow),
    cart: Array.isArray(cart?.[0]?.items) ? cart[0].items : [],
  };
}

export async function getShopPurchases() {
  requireDatabase();
  const rows = await supabaseRequest('shop_purchases?select=id,occurred_at,total,units,items&order=occurred_at.desc&limit=120');
  return (rows || []).map(purchaseFromRow);
}

export async function getShopMovements() {
  requireDatabase();
  const [purchases, stockResult] = await Promise.all([
    supabaseRequest('shop_purchases?select=id,occurred_at,total,units,items&order=occurred_at.desc&limit=120'),
    supabaseRequest('shop_stock_movements?select=id,barcode,product_name,previous_stock,new_stock,quantity_added,occurred_at&order=occurred_at.desc&limit=120')
      .then(rows => ({ rows: rows || [], available: true }))
      .catch(error => {
        if (error.status === 404 && /shop_stock_movements|PGRST205/i.test(error.message)) return { rows: [], available: false };
        throw error;
      }),
  ]);
  const purchaseMovements = (purchases || []).map(row => ({ ...purchaseFromRow(row), kind: 'purchase' }));
  const stockMovements = stockResult.rows.map(row => ({
    id: `stock-${row.id}`,
    kind: 'stock',
    at: row.occurred_at,
    barcode: row.barcode,
    name: row.product_name,
    previousStock: Number(row.previous_stock) || 0,
    newStock: Number(row.new_stock) || 0,
    quantityAdded: Number(row.quantity_added) || 0,
  }));
  return {
    movements: [...purchaseMovements, ...stockMovements]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 120),
    stockTrackingAvailable: stockResult.available,
  };
}

export async function getShopHistory() {
  requireDatabase();
  const rows = await supabaseRequest('shop_scan_history?select=barcode,scanned_at,found,name&order=scanned_at.desc&limit=24');
  return (rows || []).map(scanFromRow);
}

export async function saveShopProduct(input) {
  requireDatabase();
  const barcode = String(input?.barcode || '').replace(/\s/g, '');
  const name = String(input?.name || '').trim();
  const price = Number(input?.price);
  const stock = Math.floor(Number(input?.stock));
  if (!/^\d{8,14}$/.test(barcode)) throw Object.assign(new Error('Ingresá un código de barras válido.'), { status: 400 });
  if (name.length < 2) throw Object.assign(new Error('Ingresá el nombre del producto.'), { status: 400 });
  if (!Number.isFinite(price) || price < 0 || price > 99_999_999.99 || !Number.isFinite(stock) || stock < 0 || stock > 1_000_000) {
    throw Object.assign(new Error('El precio y el stock deben ser valores válidos.'), { status: 400 });
  }
  const barcodes = [...new Set([barcode, ...(Array.isArray(input.barcodes) ? input.barcodes : [])].map(String).filter(code => /^\d{8,14}$/.test(code)))].slice(0, 50);
  if (barcodes.length > 1) {
    const codeList = barcodes.join(',');
    const [primaryConflicts, aliasConflicts] = await Promise.all([
      supabaseRequest(`shop_products?select=barcode&barcode=in.(${codeList})&barcode=neq.${barcode}`),
      supabaseRequest(`shop_products?select=barcode&barcodes=ov.${encodeURIComponent(`{${codeList}}`)}&barcode=neq.${barcode}`),
    ]);
    if ((primaryConflicts || []).length || (aliasConflicts || []).length) {
      throw Object.assign(new Error('Ese código ya está asociado a otro producto del inventario.'), { status: 409 });
    }
  }
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

export async function deleteShopProduct(barcodeInput) {
  requireDatabase();
  const barcode = String(barcodeInput || '').trim();
  if (!/^\d{8,14}$/.test(barcode)) throw Object.assign(new Error('El código de barras del producto no es válido.'), { status: 400 });
  const query = new URLSearchParams({ barcode: `eq.${barcode}`, select: 'barcode' });
  const deleted = await supabaseRequest(`shop_products?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  if (!Array.isArray(deleted) || deleted.length === 0) {
    throw Object.assign(new Error('No se encontró un producto del inventario con ese código de barras.'), { status: 404 });
  }
  return { barcode: deleted[0].barcode };
}

export async function resetShopInventory() {
  requireDatabase();
  await supabaseRequest('shop_products?barcode=not.is.null', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ price: 0, updated_at: new Date().toISOString() }),
  });
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
  if (items.some(item => !/^\d{8,14}$/.test(item.barcode))) throw Object.assign(new Error('La compra contiene un código de barras inválido.'), { status: 400 });
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

async function findShopProductsByBarcodes(codes) {
  const unique = [...new Set(codes)];
  const select = 'barcode,barcodes,name,brand,category,quantity,image_url,price,stock';
  const [primary, aliases] = await Promise.all([
    supabaseRequest(`shop_products?select=${select}&barcode=in.(${unique.join(',')})`),
    supabaseRequest(`shop_products?select=${select}&barcodes=ov.${encodeURIComponent(`{${unique.join(',')}}`)}`),
  ]);
  const products = new Map();
  for (const row of [...(primary || []), ...(aliases || [])]) products.set(row.barcode, row);
  return [...products.values()];
}

function purchaseError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

export async function recordShopPurchase(inputItems) {
  requireDatabase();
  if (!Array.isArray(inputItems) || inputItems.length === 0 || inputItems.length > 200) {
    throw purchaseError('La compra no tiene productos válidos.', 400);
  }

  const requested = new Map();
  for (const raw of inputItems) {
    const barcode = String(raw?.barcode || '').replace(/\s/g, '');
    const qty = Number(raw?.qty);
    if (!/^\d{8,14}$/.test(barcode)) throw purchaseError('Hay un código de barras inválido en la compra.', 400);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) throw purchaseError('Hay una cantidad inválida en la compra.', 400);
    requested.set(barcode, (requested.get(barcode) || 0) + qty);
  }
  if ([...requested.values()].some(qty => qty > 100_000)) throw purchaseError('Hay una cantidad inválida en la compra.', 400);

  const products = await findShopProductsByBarcodes([...requested.keys()]);
  const byBarcode = new Map(products.map(product => [product.barcode, product]));
  const aliasOwners = new Map();
  for (const product of products) {
    for (const code of (Array.isArray(product.barcodes) ? product.barcodes : [])) {
      const owners = aliasOwners.get(code) || new Set();
      owners.add(product.barcode);
      aliasOwners.set(code, owners);
    }
  }
  const resolveProduct = code => {
    if (byBarcode.has(code)) return byBarcode.get(code);
    const owners = aliasOwners.get(code);
    return owners?.size === 1 ? byBarcode.get([...owners][0]) : null;
  };

  const lines = new Map();
  for (const [barcode, qty] of requested) {
    const product = resolveProduct(barcode);
    if (!product) {
      throw purchaseError(`El producto con código ${barcode} no está en el inventario. Agregalo antes de venderlo.`, 409);
    }
    const line = lines.get(product.barcode) || { product, qty: 0 };
    line.qty += qty;
    lines.set(product.barcode, line);
  }

  for (const { product, qty } of lines.values()) {
    const stock = Math.max(0, Number(product.stock) || 0);
    if (stock < qty) {
      throw purchaseError(`No hay stock suficiente de “${product.name}”. Quedan ${stock} unidad${stock === 1 ? '' : 'es'}.`, 409);
    }
  }

  const items = [...lines.values()].map(({ product, qty }) => ({
    barcode: product.barcode,
    name: String(product.name || 'Producto').slice(0, 180),
    brand: String(product.brand || '').slice(0, 100),
    quantity: String(product.quantity || '').slice(0, 80),
    image: String(product.image_url || '').slice(0, 1500),
    price: Math.round((Number(product.price) || 0) * 100) / 100,
    qty,
  }));

  let purchase;
  try {
    purchase = await supabaseRequest('rpc/record_shop_purchase', { method: 'POST', body: JSON.stringify({ p_items: items }) });
  } catch (error) {
    if (/insufficient stock/i.test(error.message || '')) {
      throw purchaseError('El stock cambió mientras se registraba la compra. Revisá la compra y volvé a intentar.', 409);
    }
    if (/product not found/i.test(error.message || '')) {
      throw purchaseError('Uno de los productos ya no está en el inventario. Actualizá la compra y volvé a intentar.', 409);
    }
    if (/ambiguous barcode/i.test(error.message || '')) {
      throw purchaseError('Hay un código de barras repetido en el inventario. Revisalo antes de vender.', 409);
    }
    if (/invalid purchase|purchase total/i.test(error.message || '')) {
      throw purchaseError('Los datos de la compra no son válidos. Revisá las cantidades y volvé a intentar.', 400);
    }
    throw error;
  }
  if (!purchase) throw purchaseError('No se pudo confirmar la compra. Probá de nuevo.', 502);
  return { purchase: purchaseFromRow(purchase) };
}
