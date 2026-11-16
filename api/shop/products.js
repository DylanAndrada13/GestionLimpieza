import { shopAccessResponse } from '../../lib/shop-auth.js';
import { deleteShopProduct, resetShopInventory, saveShopProduct } from '../../lib/shop-data.js';

export async function POST(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'El cuerpo debe ser JSON.' }, { status: 400 }); }
  try {
    return Response.json({ product: await saveShopProduct(input) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo guardar el producto. Probá de nuevo.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request) {
  const denied = shopAccessResponse(request);
  if (denied) return denied;
  try {
    const barcode = new URL(request.url).searchParams.get('barcode');
    if (barcode !== null) {
      const deleted = await deleteShopProduct(barcode);
      return Response.json({ ok: true, ...deleted }, { headers: { 'Cache-Control': 'no-store' } });
    }
    await resetShopInventory();
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudieron reiniciar los precios.' }, { status: error.status || 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
