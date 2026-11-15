import { clearShopSessionResponse, createShopSessionResponse, shopAccessResponse } from '../../lib/shop-auth.js';
import { getShopState } from '../../lib/shop-data.js';

export async function GET(request) {
  const denied = shopAccessResponse(request);
  return denied || new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  let payload = {};
  try { payload = await request.json(); } catch { }
  const response = createShopSessionResponse(request, payload.password);
  if (!response.ok) return response;
  try {
    const state = await getShopState();
    const headers = new Headers(response.headers);
    return Response.json(state, { status: 200, headers });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo leer la base de datos.' }, { status: error.status || 502, headers: response.headers });
  }
}

export async function DELETE() {
  return clearShopSessionResponse();
}
