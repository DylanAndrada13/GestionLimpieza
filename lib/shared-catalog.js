const supabaseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isLegacyServiceKey = () => !process.env.SUPABASE_SECRET_KEY && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function sharedCatalogConfigured() {
  return Boolean(supabaseUrl() && serviceKey());
}

export async function supabaseRequest(path, options = {}) {
  if (!sharedCatalogConfigured()) throw new Error('Catálogo no configurado');
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey(),
      // New Supabase secret keys (sb_secret_...) are API keys, not JWTs.
      // Only the legacy service_role JWT belongs in Authorization.
      ...(isLegacyServiceKey() ? { Authorization: `Bearer ${serviceKey()}` } : {}),
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(options.timeout || 8000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data?.message || `El servicio respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const barcodeOk = value => /^\d{8,14}$/.test(String(value || ''));
const equivalentBarcodes = value => {
  const code = String(value || '');
  const variants = [code];
  if (/^\d{12}$/.test(code)) variants.push(`0${code}`);
  if (/^0\d{12}$/.test(code)) variants.push(code.slice(1));
  return [...new Set(variants)];
};

export async function lookupSharedBarcode(barcode) {
  if (!barcodeOk(barcode)) throw Object.assign(new Error('Código inválido'), { status: 400 });
  if (!sharedCatalogConfigured()) return { configured: false, status: 'not_configured' };
  const equivalents = equivalentBarcodes(barcode);
  const query = new URLSearchParams({ select: 'barcode,item_id,source,verified', barcode: `in.(${equivalents.join(',')})`, limit: '1' });
  const matches = await supabaseRequest(`catalog_barcodes?${query}`);
  if (!matches?.length) return { configured: true, status: 'empty' };
  const itemQuery = new URLSearchParams({ select: 'id,family_id,primary_barcode,name,brand,quantity,category,image_url,source,verified', id: `eq.${matches[0].item_id}`, limit: '1' });
  const items = await supabaseRequest(`catalog_items?${itemQuery}`);
  const item = items?.[0];
  if (!item) return { configured: true, status: 'empty' };
  const codesQuery = new URLSearchParams({ select: 'barcode', item_id: `eq.${item.id}`, order: 'created_at.asc' });
  const codes = await supabaseRequest(`catalog_barcodes?${codesQuery}`);
  return {
    configured: true,
    status: 'found',
    product: {
      barcode: String(barcode),
      barcodes: [...new Set([...(codes || []).map(row => row.barcode), String(barcode)])],
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      category: item.category,
      image: item.image_url || '',
      source: 'Catálogo compartido',
      verified: Boolean(item.verified),
      detail: item.verified ? `Ficha verificada · ${item.source}` : `Aporte compartido · ${item.source}`,
      familyId: item.family_id,
      itemId: item.id,
      shared: true,
    },
  };
}

export async function searchSharedCatalog(query) {
  if (!sharedCatalogConfigured()) return { configured: false, products: [] };
  const term = String(query || '').replace(/[^\p{L}\p{N} .-]/gu, ' ').trim().slice(0, 80);
  if (term.length < 3) return { configured: true, products: [] };
  const params = new URLSearchParams({
    select: 'id,family_id,primary_barcode,name,brand,quantity,category,image_url,source,verified',
    or: `(name.ilike.*${term}*,brand.ilike.*${term}*)`,
    order: 'verified.desc,created_at.desc',
    limit: '12',
  });
  const items = await supabaseRequest(`catalog_items?${params}`);
  return {
    configured: true,
    products: (items || []).map(item => ({
      barcode: item.primary_barcode,
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      category: item.category,
      image: item.image_url || '',
      source: 'Catálogo compartido',
      verified: Boolean(item.verified),
      familyId: item.family_id,
      itemId: item.id,
      shared: true,
    })),
  };
}

const contributionWindows = new Map();
export function contributionRateLimited(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const current = contributionWindows.get(ip);
  if (!current || now - current.start > 10 * 60_000) {
    contributionWindows.set(ip, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

export async function contributeSharedProduct(input) {
  if (!sharedCatalogConfigured()) return { configured: false, status: 'not_configured' };
  const barcode = String(input?.barcode || '').replace(/\s/g, '');
  const name = String(input?.name || '').trim();
  const brand = String(input?.brand || '').trim();
  const quantity = String(input?.quantity || '').trim();
  const category = String(input?.category || '').trim();
  const image = String(input?.image || '').trim();
  const linkBarcode = String(input?.linkBarcode || '').replace(/\s/g, '');
  const familyBarcode = String(input?.familyBarcode || '').replace(/\s/g, '');
  if (!barcodeOk(barcode)) throw Object.assign(new Error('Código inválido'), { status: 400 });
  if (linkBarcode && familyBarcode) throw Object.assign(new Error('Elegí asociar el código de barras a una ficha o crear una variante'), { status: 400 });
  if (!linkBarcode && name.length < 2) throw Object.assign(new Error('Ingresá el nombre del producto'), { status: 400 });
  if (image && (!image.startsWith('https://') || image.length > 1500)) throw Object.assign(new Error('La imagen debe tener una URL HTTPS válida'), { status: 400 });
  const result = await supabaseRequest('rpc/catalog_contribute', {
    method: 'POST',
    body: JSON.stringify({
      p_barcode: barcode,
      p_name: name || 'Producto compartido',
      p_brand: brand,
      p_quantity: quantity,
      p_category: category,
      p_image_url: image || null,
      p_link_barcode: linkBarcode || null,
      p_family_barcode: familyBarcode || null,
    }),
  });
  return { configured: true, status: 'saved', result };
}

export async function importSharedCatalogBatch(products) {
  return supabaseRequest('rpc/catalog_import_batch', {
    method: 'POST',
    body: JSON.stringify({ p_products: products }),
    timeout: 20_000,
  });
}

// Row count without downloading rows (PostgREST count header). Used for the cheap change check.
export async function supabaseCount(table) {
  if (!sharedCatalogConfigured()) throw new Error('Catálogo no configurado');
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?select=barcode&limit=1`, {
    method: 'HEAD',
    headers: {
      apikey: serviceKey(),
      ...(isLegacyServiceKey() ? { Authorization: `Bearer ${serviceKey()}` } : {}),
      Prefer: 'count=exact',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error(`El servicio respondió ${response.status}`), { status: response.status });
  return Number(String(response.headers.get('content-range') || '').split('/')[1]) || 0;
}
