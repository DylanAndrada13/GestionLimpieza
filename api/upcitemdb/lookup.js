export async function POST(request) {
  let code = '';
  try {
    const body = await request.json();
    code = String(body?.upc || '').replace(/\s/g, '');
  } catch {
    return Response.json({ error: 'El cuerpo debe ser JSON' }, { status: 400 });
  }

  if (!/^\d{8,14}$/.test(code)) {
    return Response.json({ error: 'Código inválido' }, { status: 400 });
  }

  try {
    const upstream = await fetch('https://api.upcitemdb.com/prod/trial/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ upc: code }),
      signal: AbortSignal.timeout(9000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return Response.json({ error: 'UPCitemdb no está disponible ahora' }, { status: 502 });
  }
}
