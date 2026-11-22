import { lookupSharedBarcode } from '../../lib/shared-catalog.js';

export async function GET(request) {
  const barcode = new URL(request.url).searchParams.get('barcode');
  try {
    const result = await lookupSharedBarcode(barcode);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ status: error?.status === 400 ? 'invalid' : 'error', error: error?.message || 'No se pudo consultar el catálogo compartido' }, {
      status: error?.status === 400 ? 400 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
