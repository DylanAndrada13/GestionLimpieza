const BASE_URL = 'https://api.ez-catalog.huggian.com/v1/products/barcode';

export async function lookupEzCatalog(code, apiKey = process.env.EZ_CATALOG_API_KEY) {
  const barcode = String(code || '').replace(/\s/g, '');
  if (!/^\d{8,14}$/.test(barcode)) {
    return { status: 400, body: { error: 'Código inválido' } };
  }
  if (!apiKey) {
    return { status: 200, body: { configured: false, status: 'not_configured' } };
  }
  try {
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(barcode)}`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (response.status === 404) return { status: 200, body: { configured: true, status: 'empty' } };
    if (response.status === 401 || response.status === 403) {
      return { status: 200, body: { configured: true, status: 'auth_error' } };
    }
    if (response.status === 429) return { status: 200, body: { configured: true, status: 'rate_limited' } };
    if (!response.ok) throw new Error(`ez-catalog returned ${response.status}`);
    const product = await response.json();
    return { status: 200, body: { configured: true, status: 'found', product } };
  } catch {
    return { status: 200, body: { configured: true, status: 'error' } };
  }
}
