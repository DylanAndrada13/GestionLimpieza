import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadEnvFile(file) {
  try {
    const contents = await readFile(file, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(SUPABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { }
}

await loadEnvFile(path.join(root, '.env.local'));
await loadEnvFile(path.join(root, '.env'));
const baseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const useLegacyServiceRoleKey = !process.env.SUPABASE_SECRET_KEY && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!baseUrl || !serviceKey) throw new Error('Definí SUPABASE_URL y SUPABASE_SECRET_KEY (o la clave legacy SUPABASE_SERVICE_ROLE_KEY) en .env.local o en el entorno.');

async function loadSource(folder, source) {
  const dir = path.join(root, 'public', 'data', folder);
  const files = (await readdir(dir)).filter(file => file.endsWith('.json') && file !== 'manifest.json');
  const products = [];
  for (const file of files) {
    const values = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    for (const product of values) {
      products.push({
        barcode: String(product.barcode || ''),
        barcodes: product.barcodes || [String(product.barcode || '')],
        name: product.name || 'Producto importado',
        brand: product.brand || '',
        quantity: product.quantity || '',
        category: product.category || 'Limpieza',
        image: product.image || '',
        source,
      });
    }
  }
  return products;
}

const products = [
  ...(await loadSource('ddi-cleaning', 'DDI')),
  ...(await loadSource('sepa-cleaning', 'SEPA')),
];
let inserted = 0;
let linked = 0;
for (let offset = 0; offset < products.length; offset += 200) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/catalog_import_batch`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      ...(useLegacyServiceRoleKey ? { Authorization: `Bearer ${serviceKey}` } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_products: products.slice(offset, offset + 200) }),
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Importación falló (${response.status}): ${body.message || JSON.stringify(body)}`);
  inserted += Number(body.inserted || 0);
  linked += Number(body.linked || 0);
  console.log(`Procesados ${Math.min(offset + 200, products.length)}/${products.length}`);
}
console.log(JSON.stringify({ supplied: products.length, inserted, linked }, null, 2));
