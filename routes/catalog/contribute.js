import { contributeSharedProduct, contributionRateLimited } from '../../lib/shared-catalog.js';

export async function POST(request) {
  if (contributionRateLimited(request)) {
    return Response.json({ status: 'rate_limited', error: 'Límite de aportes alcanzado. Probá más tarde.' }, { status: 429 });
  }
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'El cuerpo debe ser JSON' }, { status: 400 }); }
  try {
    const result = await contributeSharedProduct(input);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error?.status === 400 ? 400 : error?.status === 409 ? 409 : 502;
    return Response.json({ status: 'error', error: error?.message || 'No se pudo guardar el producto compartido' }, { status });
  }
}
