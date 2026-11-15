-- Limpieza de datos de prueba para entregar la app al cliente.
--
-- ATENCIÓN: borra datos. Ejecutalo únicamente en el proyecto correcto,
-- nunca sobre una base que ya esté usando el cliente.
--
-- Ejecutar en Supabase > SQL Editor.
--
-- Borra:
--   - inventario del local y carrito abierto
--   - compras, movimientos de stock e historial de escaneos
--   - aportes manuales del catálogo compartido (source = 'community')
--
-- Conserva:
--   - catálogo importado de SEPA y DDI
--   - APIs, funciones y búsquedas de productos
--
-- Es idempotente: se puede ejecutar más de una vez.
-- Revisá el bloque de aportes manuales si querés conservarlos.

begin;

-- 1. Datos privados del local.
--    RESTART IDENTITY reinicia los contadores de las tablas que los tienen.
truncate table
  public.shop_products,
  public.shop_cart,
  public.shop_purchases,
  public.shop_stock_movements,
  public.shop_scan_history
restart identity;

-- 2. Aportes manuales al catálogo compartido.
--    Si querés conservar los aportes hechos a mano, comentá estas tres
--    sentencias (desde el primer delete hasta el último punto y coma).
delete from public.catalog_barcodes
where source = 'community';

delete from public.catalog_items
where source = 'community';

delete from public.catalog_families f
where not exists (
  select 1
  from public.catalog_items i
  where i.family_id = f.id
);

commit;

-- 3. Verificación.
--    Todo debe dar 0, salvo el catálogo importado que se conserva.
select 'shop_products' as tabla, count(*) as registros from public.shop_products
union all
select 'shop_cart', count(*) from public.shop_cart
union all
select 'shop_purchases', count(*) from public.shop_purchases
union all
select 'shop_stock_movements', count(*) from public.shop_stock_movements
union all
select 'shop_scan_history', count(*) from public.shop_scan_history
union all
select 'catalog_items (community)', count(*) from public.catalog_items where source = 'community'
union all
select 'catalog_barcodes (community)', count(*) from public.catalog_barcodes where source = 'community'
union all
select 'catalog_items (SEPA/DDI conservados)', count(*) from public.catalog_items
order by tabla;
