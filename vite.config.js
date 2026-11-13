import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { lookupEzCatalog } from './lib/ez-catalog.js';

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

export default defineConfig({
  plugins: [react(), ezCatalogDevApi()],
  server: { proxy: { '/api/upcitemdb': { target: 'https://api.upcitemdb.com', changeOrigin: true, rewrite: path => path.replace(/^\/api\/upcitemdb/, '/prod/trial') } } },
});
