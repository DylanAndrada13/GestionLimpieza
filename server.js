import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

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
