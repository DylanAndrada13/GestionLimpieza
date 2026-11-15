export const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const isBarcode = (value) => /^\d{8,14}$/.test(String(value || '').replace(/\s/g, ''));

export function equivalentBarcodes(code) {
  const value = String(code || '').trim();
  const variants = [value];
  if (/^\d{12}$/.test(value)) variants.push(`0${value}`);
  if (/^0\d{12}$/.test(value)) variants.push(value.slice(1));
  return [...new Set(variants.filter(Boolean))];
}

export function productBarcodes(item) {
  return [...new Set([
    item?.barcode,
    ...(Array.isArray(item?.barcodes) ? item.barcodes : []),
  ].filter(Boolean).map(String))];
}

export function findLocalProduct(catalog, code) {
  const equivalents = equivalentBarcodes(code);
  return (catalog || []).find(item => productBarcodes(item).some(value => equivalents.includes(value))) || null;
}

const numberValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

function readPrice(raw) {
  const candidates = [
    raw?.price,
    raw?.precio,
    raw?.sale_price,
    raw?.lowest_recorded_price,
    raw?.offers?.[0]?.price,
    raw?.precios?.[0]?.precio,
    raw?.precios?.[0]?.price,
  ];
  for (const candidate of candidates) {
    const value = numberValue(candidate);
    if (value > 0) return value;
  }
  return 0;
}

export function normalizeProduct(raw, source) {
  return {
    barcode: String(raw?.barcode || raw?.code || ''),
    barcodes: [...new Set([raw?.barcode, raw?.code, ...(Array.isArray(raw?.barcodes) ? raw.barcodes : [])].filter(Boolean).map(String))],
    name: tidy(raw?.name || raw?.product_name || raw?.title),
    brand: tidy(raw?.brand || raw?.brands),
    quantity: tidy(raw?.quantity || raw?.size || raw?.net_content),
    image: raw?.image || raw?.image_url || '',
    category: tidy(raw?.category || raw?.categories),
    price: readPrice(raw),
    stock: Math.max(0, Math.round(numberValue(raw?.stock))),
    verified: Boolean(raw?.verified),
    detail: tidy(raw?.detail),
    source,
  };
}

export function sanitizeStoredProduct(item) {
  return {
    ...item,
    barcode: String(item?.barcode || ''),
    barcodes: productBarcodes(item),
    name: tidy(item?.name),
    brand: tidy(item?.brand),
    quantity: tidy(item?.quantity),
    category: tidy(item?.category),
    image: item?.image || '',
    price: Math.max(0, numberValue(item?.price)),
    stock: Math.max(0, Math.round(numberValue(item?.stock))),
    source: item?.source || 'Mi inventario',
  };
}

async function lookupSepaBulk(code) {
  const shard = code.slice(-2);
  const response = await fetch(`/data/sepa-cleaning/${shard}.json`, { signal: AbortSignal.timeout(2500) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('El catálogo SEPA local no respondió');
  const products = await response.json();
  const equivalents = equivalentBarcodes(code);
  const product = products.find(entry => equivalents.includes(entry.barcode)) || null;
  return product ? { ...product, barcode: code, barcodes: [...new Set([product.barcode, ...(product.barcodes || []), code])] } : null;
}

async function lookupDdiBulk(code) {
  const shard = code.slice(-2);
  const response = await fetch(`/data/ddi-cleaning/${shard}.json`, { signal: AbortSignal.timeout(2500) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('El catálogo DDI no respondió');
  const products = await response.json();
  const equivalents = equivalentBarcodes(code);
  const product = products.find(entry => equivalents.includes(entry.barcode) || entry.barcodes?.some(value => equivalents.includes(value))) || null;
  return product ? { ...product, barcode: code, barcodes: [...new Set([product.barcode, ...(product.barcodes || []), code])] } : null;
}

async function lookupSepa(code) {
  const regions = ['NACIONAL', 'AMBA', 'CENTRO', 'CUYO', 'NEA', 'NOA', 'PATAGONIA'];
  const getRegion = async region => {
    const response = await fetch(`https://hysmarcos.github.io/superprecios-claros/v1/sku/${encodeURIComponent(code)}/${region}.json`, { signal: AbortSignal.timeout(7000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`SEPA ${region} no respondió`);
    return response.json();
  };
  try {
    const national = await getRegion('NACIONAL');
    if (national?.producto?.nombre) return { product: national, regions: ['NACIONAL'] };
    const results = await Promise.allSettled(regions.slice(1).map(async region => ({ region, data: await getRegion(region) })));
    const found = results.filter(result => result.status === 'fulfilled' && result.value.data?.producto?.nombre).map(result => result.value);
    if (found.length) return { product: found[0].data, regions: found.map(result => result.region) };
    if (results.some(result => result.status === 'rejected')) throw new Error('No se pudieron consultar todas las regiones');
    return null;
  } catch {
    return { error: true };
  }
}

/**
 * Consulta todas las fuentes disponibles sin bloquear la pantalla:
 * cada resultado se entrega en cuanto llega mediante onFound.
 */
export async function fetchSources(code, onSource = () => {}, onFound = () => {}) {
  const results = [];
  const push = (item, sourceId) => {
    results.push(item);
    onSource(sourceId, 'found', item);
    onFound(item);
  };

  const checks = [
    (async () => {
      try {
        const response = await fetch(`/api/catalog/lookup?barcode=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Catálogo compartido no respondió');
        const json = await response.json();
        if (json.status === 'found' && json.product) {
          const item = normalizeProduct(json.product, 'Catálogo compartido');
          item.barcodes = json.product.barcodes || [item.barcode];
          item.shared = true;
          item.familyId = json.product.familyId;
          item.itemId = json.product.itemId;
          push(item, 'shared');
        } else onSource('shared', json.status || (json.configured === false ? 'not_configured' : 'empty'));
      } catch { onSource('shared', 'error'); }
    })(),
    (async () => {
      try {
        const product = await lookupDdiBulk(code);
        if (product) {
          const item = normalizeProduct({ ...product, detail: 'Catálogo público de distribuidora DDI' }, 'DDI · catálogo de limpieza');
          item.barcodes = product.barcodes || [item.barcode];
          push(item, 'ddi');
        } else onSource('ddi', 'empty');
      } catch { onSource('ddi', 'error'); }
    })(),
    (async () => {
      try {
        const product = await lookupSepaBulk(code);
        if (product) {
          const item = normalizeProduct({ ...product, detail: `Catálogo SEPA · ${product.observations} registros de comercios` }, 'SEPA · catálogo cargado');
          push(item, 'sepa-bulk');
        } else onSource('sepa-bulk', 'empty');
      } catch { onSource('sepa-bulk', 'error'); }
    })(),
    (async () => {
      try {
        const lookup = await lookupSepa(code);
        if (lookup?.error) { onSource('sepa', 'error'); return; }
        if (!lookup) { onSource('sepa', 'empty'); return; }
        const json = lookup.product;
        if (json.producto?.nombre) {
          const product = json.producto;
          const item = normalizeProduct({
            barcode: json.ean || code,
            name: product.nombre,
            brand: product.marca,
            quantity: [product.cantidad, product.unidad].filter(value => value !== null && value !== undefined && value !== '').join(' '),
            detail: [json.fecha, lookup.regions.join('/'), json.precios?.length ? `${json.precios.length} cadenas` : ''].filter(Boolean).join(' · '),
            price: json.precios?.[0]?.precio,
          }, 'SEPA · Precios Claros');
          push(item, 'sepa');
        } else onSource('sepa', 'empty');
      } catch { onSource('sepa', 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch(`/api/ez-catalog/lookup?code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('ez-catalog no respondió');
        const json = await res.json();
        if (json.status === 'found' && json.product) {
          const product = json.product;
          const item = normalizeProduct({
            barcode: product.barcode || code,
            name: product.name,
            brand: product.brand,
            quantity: product.presentation,
            image: product.image_url,
            category: product.category_name || product.subcategory,
            verified: product.verified,
            detail: product.verified ? 'Ficha verificada' : '',
          }, 'ez-catalog');
          push(item, 'ez');
        } else onSource('ez', json.status || (json.configured === false ? 'not_configured' : 'empty'));
      } catch { onSource('ez', 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch(`https://world.openproductsfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,quantity,image_url,categories`, { signal: AbortSignal.timeout(9000) });
        if (res.status === 404) { onSource('opf', 'empty'); return; }
        if (!res.ok) throw new Error('Sin respuesta');
        const json = await res.json();
        if ((json.status === 'success' || json.status === 1) && json.product) {
          push(normalizeProduct({ barcode: code, ...json.product }, 'Open Products Facts'), 'opf');
        } else onSource('opf', 'empty');
      } catch (error) { onSource('opf', error?.status === 404 ? 'empty' : 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch(`https://world.openbeautyfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,quantity,image_url,categories`, { signal: AbortSignal.timeout(8000) });
        if (res.status === 404) { onSource('beauty', 'empty'); return; }
        if (!res.ok) throw new Error('Open Beauty Facts no respondió');
        const json = await res.json();
        if ((json.status === 'success' || json.status === 1) && json.product) {
          push(normalizeProduct({ barcode: code, ...json.product }, 'Open Beauty Facts'), 'beauty');
        } else onSource('beauty', 'empty');
      } catch { onSource('beauty', 'error'); }
    })(),
    (async () => {
      try {
        const res = await fetch('/api/upcitemdb/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ upc: code }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 404) { onSource('upc', 'empty'); return; }
        if (!res.ok) throw new Error('Sin respuesta');
        const json = await res.json();
        const product = json.items?.[0];
        if (product) {
          push(normalizeProduct({
            barcode: code,
            name: product.title,
            brand: product.brand,
            quantity: product.size,
            image: product.images?.[0],
            category: product.category,
            price: product.offers?.[0]?.price,
          }, 'UPCitemdb'), 'upc');
        } else onSource('upc', 'empty');
      } catch (error) { onSource('upc', error?.status === 404 ? 'empty' : 'error'); }
    })(),
  ];

  await Promise.all(checks);
  const priority = {
    'Catálogo compartido': 0,
    'DDI · catálogo de limpieza': 1,
    'SEPA · catálogo cargado': 2,
    'SEPA · Precios Claros': 3,
    'ez-catalog': 4,
    'Open Products Facts': 5,
    'Open Beauty Facts': 6,
    'UPCitemdb': 7,
  };
  return results.sort((a, b) => (priority[a.source] ?? 10) - (priority[b.source] ?? 10));
}

export function mergeProduct(local, external, barcode) {
  if (!local && !external) return null;
  const base = external || {};
  const own = local || {};
  return {
    ...base,
    ...own,
    barcode: String(barcode || own.barcode || base.barcode || ''),
    barcodes: [...new Set([...(own.barcodes || []), ...(base.barcodes || []), barcode].filter(Boolean).map(String))],
    name: own.name || base.name || '',
    brand: own.brand || base.brand || '',
    quantity: own.quantity || base.quantity || '',
    category: own.category || base.category || '',
    image: own.image || base.image || '',
    price: Number(own.price) > 0 ? Number(own.price) : Number(base.price) || 0,
    stock: Number.isFinite(Number(own.stock)) ? Math.max(0, Number(own.stock)) : 0,
    source: own.source || base.source || 'Mi inventario',
    inInventory: Boolean(own.barcode),
  };
}

export function totalUnits(catalog) {
  return catalog.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
}
