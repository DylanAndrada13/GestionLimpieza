import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupEzCatalog } from './lib/ez-catalog.js';
import { contributeSharedProduct, contributionRateLimited, lookupSharedBarcode, searchSharedCatalog } from './lib/shared-catalog.js';
import { GET as getShopState } from './api/shop/state.js';
import { GET as checkShopSession, POST as createShopSession, DELETE as clearShopSession } from './api/shop/session.js';
import { POST as saveShopProduct, DELETE as resetShopProducts } from './api/shop/products.js';
import { GET as listShopPurchases, POST as recordShopPurchase } from './api/shop/purchases.js';
import { GET as listShopMovements } from './api/shop/movements.js';
import { GET as listShopHistory, POST as recordShopHistory, DELETE as clearShopHistory } from './api/shop/history.js';
import { POST as saveShopCart } from './api/shop/cart.js';
import { GET as listWebOrders, POST as updateWebOrder } from './api/shop/web-orders.js';

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

const asRequest = req => ({ headers: { get: name => req.headers[name.toLowerCase()] || null } });

const shopHandlers = {
  'GET /api/shop/session': checkShopSession,
  'POST /api/shop/session': createShopSession,
  'DELETE /api/shop/session': clearShopSession,
  'GET /api/shop/state': getShopState,
  'POST /api/shop/products': saveShopProduct,
  'DELETE /api/shop/products': resetShopProducts,
  'POST /api/shop/purchases': recordShopPurchase,
  'GET /api/shop/purchases': listShopPurchases,
  'GET /api/shop/movements': listShopMovements,
  'POST /api/shop/cart': saveShopCart,
  'POST /api/shop/history': recordShopHistory,
  'GET /api/shop/history': listShopHistory,
  'DELETE /api/shop/history': clearShopHistory,
  'GET /api/shop/web-orders': listWebOrders,
  'POST /api/shop/web-orders': updateWebOrder,
};

app.all('/api/shop/:resource', async (req, res, next) => {
  const handler = shopHandlers[`${req.method} /api/shop/${req.params.resource}`];
  if (!handler) return next();
  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body || {});
    const request = new Request(`http://${req.headers.host}${req.originalUrl}`, {
      method: req.method,
      headers: req.headers,
      ...(body ? { body } : {}),
    });
    const response = await handler(request);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Error interno del servidor.' });
  }
});

app.get('/api/catalog/lookup', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await lookupSharedBarcode(req.query.barcode)); }
  catch (error) { res.status(error?.status === 400 ? 400 : 502).set('Cache-Control', 'no-store').json({ status: error?.status === 400 ? 'invalid' : 'error', error: error?.message || 'No se pudo consultar el catálogo compartido' }); }
});

app.get('/api/catalog/search', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await searchSharedCatalog(req.query.q)); }
  catch (error) { res.status(502).set('Cache-Control', 'no-store').json({ configured: true, products: [], error: error?.message || 'No se pudo buscar en el catálogo compartido' }); }
});

app.post('/api/catalog/contribute', async (req, res) => {
  const request = asRequest(req);
  if (contributionRateLimited(request)) return res.status(429).json({ status: 'rate_limited', error: 'Límite de aportes alcanzado. Probá más tarde.' });
  try { res.set('Cache-Control', 'no-store').json(await contributeSharedProduct(req.body)); }
  catch (error) { res.status(error?.status === 400 ? 400 : error?.status === 409 ? 409 : 502).json({ status: 'error', error: error?.message || 'No se pudo guardar el producto compartido' }); }
});

app.get('/api/ez-catalog/lookup', async (req, res) => {
  const result = await lookupEzCatalog(req.query.code);
  res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
});

app.post('/api/upcitemdb/lookup', async (req, res) => {
  const code = String(req.body?.upc || '').replace(/\s/g, '');
  if (!/^\d{8,14}$/.test(code)) return res.status(400).json({ error: 'Código inválido' });
  try {
    const upstream = await fetch('https://api.upcitemdb.com/prod/trial/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ upc: code }),
      signal: AbortSignal.timeout(9000),
    });
    const body = await upstream.text();
    res.status(upstream.status).type('application/json').send(body);
  } catch {
    res.status(502).json({ error: 'UPCitemdb no está disponible ahora' });
  }
});

app.use(express.static(path.join(here, 'dist'), { maxAge: '1h', index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(here, 'dist', 'index.html')));
app.listen(port, '0.0.0.0', () => console.log(`Limpia disponible en http://localhost:${port}`));
