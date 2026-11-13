import { lookupEzCatalog } from '../../lib/ez-catalog.js';

export async function GET(request) {
  const url = new URL(request.url);
  const result = await lookupEzCatalog(url.searchParams.get('code'));
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
