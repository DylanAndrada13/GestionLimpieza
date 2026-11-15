import { shopAccessResponse } from '../../lib/shop-auth.js';
import { saveShopCart } from '../../lib/shop-data.js';

export async function POST(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'El cuerpo debe ser JSON.' }, { status: 400 }); }
  try {
    return Response.json({ cart: await saveShopCart(input.items) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo guardar el carrito en Supabase.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
