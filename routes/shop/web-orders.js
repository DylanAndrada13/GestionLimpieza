import { shopAccessResponse } from '../../lib/shop-auth.js';
import { listWebOrders, updateWebOrder } from '../../lib/web-orders.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    return Response.json(await listWebOrders(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudieron cargar los pedidos online.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'El cuerpo debe ser JSON.' }, { status: 400 }); }
  try {
    return Response.json(await updateWebOrder(input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo actualizar el pedido.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
