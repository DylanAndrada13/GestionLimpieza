import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'data', 'ddi-cleaning');
const pageSize = 24;
const delayMs = Number(process.env.DDI_REQUEST_DELAY_MS || 1200);
const routes = [
  '/product/by/grupo/limpieza',
  '/product/by/category/accesorios-de-limpieza',
  '/product/by/category/esponjas',
  '/product/by/category/panos-y-trapos',
  '/product/by/sub_category/escobas-y-escobillones',
  '/product/by/sub_category/trapos-de-piso',
  '/product/by/sub_category/esponjas-de-acero',
  '/product/by/sub_category/esponjas-de-bronce',
  '/product/by/sub_category/fibraesponjas',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readCatalogPage(html) {
  for (const match of html.matchAll(/self\.__next_f\.push\((\[1,.*?\])\)<\/script>/gs)) {
    let stream;
    try { stream = JSON.parse(match[1])?.[1]; } catch { continue; }
    if (typeof stream !== 'string' || !stream.includes('"productos"') || !stream.includes('"count"')) continue;
    const colon = stream.indexOf(':');
    if (colon < 0) continue;
    try {
      const payload = JSON.parse(stream.slice(colon + 1));
      const props = payload?.[3];
      if (Array.isArray(props?.productos) && Number.isFinite(Number(props.count))) return props;
    } catch { }
  }
  throw new Error('No se pudo leer el catálogo público de DDI; puede haber cambiado el formato del sitio.');
}

function normalizeProduct(raw, sourceUrl) {
  const barcode = String(raw.cod_barras || '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(barcode)) return null;
  const barcodes = [...new Set([barcode, String(raw.cod_barras2 || '').replace(/\D/g, '')].filter(code => /^\d{8,14}$/.test(code)))];
  const name = String(raw.name || '').replace(/\s+/g, ' ').trim();
  const brand = String(raw.marca || '').replace(/\s+/g, ' ').trim();
  const quantity = name.match(/\b\d+(?:[.,]\d+)?\s?(?:ml|cc|lts?|litros?|gr?|kg|g|un)\b/i)?.[0]?.toUpperCase() || '';
  const text = `${name} ${raw.sub_category || ''}`.toLocaleLowerCase('es-AR');
  if (!/(lavand|deterg|jab[oó]n|ropa|suaviz|limpi|pa[nñ]o|trapo|escob|esponja|fibra|virulana|cepillo|mopa|balde|guante|aromatiz|cera)/i.test(text)) return null;
  return {
    barcode,
    barcodes,
    name: name || 'Producto de limpieza',
    brand,
    quantity,
    category: String(raw.sub_category || 'Limpieza').trim(),
    image: String(raw.photo || raw.get_thumbnail || ''),
    source: 'DDI',
    sourceUrl,
    verified: false,
  };
}

async function fetchPage(route, page) {
  const url = new URL(route, 'https://ddisrl.com.ar');
  url.searchParams.set('p', String(page));
  url.searchParams.set('page_size', String(pageSize));
  const response = await fetch(url, {
    headers: { 'User-Agent': 'LimpiaCatalogImporter/1.0 (public product metadata; respectful 5s delay)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`DDI ${url.pathname} página ${page}: HTTP ${response.status}`);
  return readCatalogPage(await response.text());
}

const byCode = new Map();
let pagesRead = 0;
for (const route of routes) {
  let first;
  try { first = await fetchPage(route, 1); }
  catch (error) { console.warn(`Se omite ${route}: ${error.message}`); continue; }
  pagesRead++;
  const pages = Math.ceil(Number(first.count) / pageSize);
  const append = (props, page) => {
    for (const raw of props.productos) {
      const item = normalizeProduct(raw, `https://ddisrl.com.ar${route}`);
      if (!item) continue;
      const old = byCode.get(item.barcode);
      if (!old || item.name.length > old.name.length) byCode.set(item.barcode, item);
      for (const alias of item.barcodes.slice(1)) {
        if (!byCode.has(alias)) byCode.set(alias, { ...item, barcode: alias, barcodes: item.barcodes });
      }
    }
  };
  append(first, 1);
  console.log(`${route}: ${first.count} productos, ${pages} páginas`);
  for (let page = 2; page <= pages; page++) {
    await sleep(delayMs);
    try { append(await fetchPage(route, page), page); pagesRead++; }
    catch (error) { console.warn(`Se omite ${route}, página ${page}: ${error.message}`); }
  }
}

const shards = new Map();
for (const item of byCode.values()) {
  const key = item.barcode.slice(-2);
  if (!shards.has(key)) shards.set(key, []);
  shards.get(key).push(item);
}
await mkdir(output, { recursive: true });
for (const file of await import('node:fs/promises').then(({ readdir }) => readdir(output))) {
  if (file.endsWith('.json')) await import('node:fs/promises').then(({ unlink }) => unlink(path.join(output, file)));
}
for (const [key, products] of shards) {
  await writeFile(path.join(output, `${key}.json`), JSON.stringify(products));
}
const manifest = {
  source: 'DDI · Distribuidora del Interior',
  sourceUrl: 'https://ddisrl.com.ar/product/by/grupo/limpieza',
  importedAt: new Date().toISOString(),
  products: byCode.size,
  pagesRead,
  shards: shards.size,
  licenseNote: 'Datos de catálogo público atribuídos a DDI; no se importan precios. Revisar términos del sitio antes de redistribuir grandes volúmenes.',
};
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
