// Single Vercel function for every /api route (Vercel Hobby allows at most 12 functions).
// vercel.json rewrites each /api/... path here; the route handlers live in /routes.
import * as catalogContribute from '../routes/catalog/contribute.js';
import * as catalogLookup from '../routes/catalog/lookup.js';
import * as catalogSearch from '../routes/catalog/search.js';
import * as ezCatalogLookup from '../routes/ez-catalog/lookup.js';
import * as shopCart from '../routes/shop/cart.js';
import * as shopHistory from '../routes/shop/history.js';
import * as shopMovements from '../routes/shop/movements.js';
import * as shopProducts from '../routes/shop/products.js';
import * as shopPurchases from '../routes/shop/purchases.js';
import * as shopSession from '../routes/shop/session.js';
import * as shopState from '../routes/shop/state.js';
import * as shopWebOrders from '../routes/shop/web-orders.js';
import * as upcitemdbLookup from '../routes/upcitemdb/lookup.js';

const ROUTES = {
  'catalog/contribute': catalogContribute,
  'catalog/lookup': catalogLookup,
  'catalog/search': catalogSearch,
  'ez-catalog/lookup': ezCatalogLookup,
  'shop/cart': shopCart,
  'shop/history': shopHistory,
  'shop/movements': shopMovements,
  'shop/products': shopProducts,
  'shop/purchases': shopPurchases,
  'shop/session': shopSession,
  'shop/state': shopState,
  'shop/web-orders': shopWebOrders,
  'upcitemdb/lookup': upcitemdbLookup,
};

async function dispatch(request) {
  const url = new URL(request.url);
  const route = (url.searchParams.get('route') || url.pathname.replace(/^\/api\//, '')).replace(/\/+$/, '');
  const routeModule = ROUTES[route];
  const handler = routeModule?.[request.method];
  if (!routeModule) return Response.json({ error: 'Ruta no encontrada.' }, { status: 404 });
  if (!handler) return Response.json({ error: 'Método no permitido.' }, { status: 405, headers: { Allow: Object.keys(routeModule).join(', ') } });
  return handler(request);
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
