import { shopAccessResponse } from '../../lib/shop-auth.js';
import { getShopState, getShopVersion } from '../../lib/shop-data.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    const versionOnly = new URL(request.url).searchParams.has('version');
    return Response.json(versionOnly ? await getShopVersion() : await getShopState(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudieron cargar los datos del local.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
