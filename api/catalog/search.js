import { searchSharedCatalog } from '../../lib/shared-catalog.js';

export async function GET(request) {
  const query = new URL(request.url).searchParams.get('q');
  try {
    return Response.json(await searchSharedCatalog(query), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ configured: true, products: [], error: error?.message || 'No se pudo buscar en el catálogo compartido' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
