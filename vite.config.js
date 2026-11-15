import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { lookupEzCatalog } from './lib/ez-catalog.js';
import { GET as getShopState } from './api/shop/state.js';
import { GET as checkShopSession, POST as createShopSession, DELETE as clearShopSession } from './api/shop/session.js';
import { POST as saveShopProduct, DELETE as resetShopProducts } from './api/shop/products.js';
import { GET as listShopPurchases, POST as recordShopPurchase } from './api/shop/purchases.js';
import { GET as listShopMovements } from './api/shop/movements.js';
import { GET as listShopHistory, POST as recordShopHistory, DELETE as clearShopHistory } from './api/shop/history.js';
import { POST as saveShopCart } from './api/shop/cart.js';

function ezCatalogDevApi() {
  return {
    name: 'ez-catalog-local-api',
    configureServer(server) {
      server.middlewares.use('/api/ez-catalog/lookup', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const url = new URL(req.url, 'http://localhost');
          const result = await lookupEzCatalog(url.searchParams.get('code'));
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(result.body));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'No se pudo consultar ez-catalog' }));
        }
      });
    },
  };
}

function shopDataDevApi() {
  const handlers = {
    '/session': { GET: checkShopSession, POST: createShopSession, DELETE: clearShopSession },
    '/state': { GET: getShopState },
    '/products': { POST: saveShopProduct, DELETE: resetShopProducts },
    '/purchases': { GET: listShopPurchases, POST: recordShopPurchase },
    '/movements': { GET: listShopMovements },
    '/cart': { POST: saveShopCart },
    '/history': { GET: listShopHistory, POST: recordShopHistory, DELETE: clearShopHistory },
  };
  return {
    name: 'shop-data-local-api',
    configureServer(server) {
      server.middlewares.use('/api/shop', async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const handler = handlers[url.pathname]?.[req.method];
        if (!handler) return next();
        try {
          const chunks = [];
          if (req.method !== 'GET' && req.method !== 'HEAD') for await (const chunk of req) chunks.push(chunk);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(url, { method: req.method, headers: req.headers, ...(body ? { body } : {}) });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error?.message || 'Error interno del servidor.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SHOP_ACCESS_PASSWORD', 'EZ_CATALOG_API_KEY']) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
  return {
    plugins: [react(), ezCatalogDevApi(), shopDataDevApi()],
    server: { proxy: { '/api/upcitemdb': { target: 'https://api.upcitemdb.com', changeOrigin: true, rewrite: path => path.replace(/^\/api\/upcitemdb/, '/prod/trial') } } },
  };
});
