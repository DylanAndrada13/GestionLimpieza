import { shopAccessResponse } from '../../lib/shop-auth.js';
import { listMercadoPagoPayments } from '../../lib/web-orders.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    const days = Number(new URL(request.url).searchParams.get('days')) || 7;
    return Response.json(await listMercadoPagoPayments(days), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudieron consultar los cobros.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
