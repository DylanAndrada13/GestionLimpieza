import { shopAccessResponse } from '../../lib/shop-auth.js';
import { clearShopHistory, getShopHistory, recordShopScan } from '../../lib/shop-data.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    return Response.json({ history: await getShopHistory() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo cargar el historial de escaneos.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'El cuerpo debe ser JSON.' }, { status: 400 }); }
  try {
    return Response.json({ scan: await recordShopScan(input) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo guardar el escaneo. Probá de nuevo.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    await clearShopHistory();
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo limpiar el historial.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
