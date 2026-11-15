import { shopAccessResponse } from '../../lib/shop-auth.js';
import { getShopPurchases, recordShopPurchase } from '../../lib/shop-data.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    return Response.json({ purchases: await getShopPurchases() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudieron cargar las compras.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'El cuerpo debe ser JSON.' }, { status: 400 }); }
  try {
    return Response.json(await recordShopPurchase(input.items), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo registrar la compra en Supabase.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
