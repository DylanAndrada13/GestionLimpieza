import { shopAccessResponse } from '../../lib/shop-auth.js';
import { getShopMovements } from '../../lib/shop-data.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    return Response.json(await getShopMovements(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudieron cargar los movimientos.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
