# CleanStock · escáner PWA

Aplicación móvil para escanear códigos EAN/UPC de productos de limpieza, mantener el inventario del local con stock y precio, y registrar compras descontando unidades automáticamente.

## Ejecutar en desarrollo

```sh
npm install
npm run dev
```

Vite ejecuta localmente la interfaz. En localhost se puede probar la cámara; para escanear desde un teléfono publicado, el sitio debe usar HTTPS.

Para habilitar ez-catalog durante el desarrollo, definí `EZ_CATALOG_API_KEY` en el entorno antes de iniciar Vite. No pongas la clave en el frontend ni la subas al repositorio.

## Inventario y compras en Supabase

1. Creá un proyecto Supabase en el plan Free.
2. En **SQL Editor**, ejecutá el contenido de `supabase/schema.sql`. Si el proyecto ya tiene el catálogo compartido instalado, podés volver a ejecutar el archivo: las tablas y funciones se crean de forma idempotente.
3. En **Project Settings → API Keys**, copiá la URL del proyecto y la **Secret key** (`sb_secret_...`). También se admite la clave JWT anterior `service_role`.
4. Definí una clave larga y única para `SHOP_ACCESS_PASSWORD`.
5. En Vercel, agregá `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `SHOP_ACCESS_PASSWORD` en **Settings → Environment Variables** para Production y Preview. Las claves solo se usan en funciones server-side, nunca como `VITE_*` ni en el navegador.
6. Volvé a desplegar la app. Al abrirla, ingresá la clave `SHOP_ACCESS_PASSWORD`. El inventario, los precios, compras y escaneos se leen y guardan en Supabase; la aplicación no usa `localStorage` ni mantiene una copia local de los datos.
7. Para desarrollo, copiá las variables al `.env.local` ignorado por Git. Corré `node scripts/sync-catalog-to-supabase.mjs` para importar los catálogos SEPA y DDI.

Las tablas de gestión del local son:

- `public.shop_products`: inventario, EAN, descripción, stock y precio asignado por el local. El precio está en la columna `price`.
- `public.shop_cart`: carrito de compra en curso, compartido con el mismo local.
- `public.shop_purchases`: compras finalizadas y total por compra. `items` conserva un JSON con la descripción, cantidad y precio de cada producto al momento de la compra.
- `public.shop_scan_history`: último escaneo guardado por EAN.

Para revisar precios, abrí el proyecto en Supabase → **Table Editor** → `shop_products` → columna `price`. El catálogo comunitario (`catalog_items`) es una tabla aparte y no contiene el precio de venta del local.

El inventario, las compras y el historial tienen RLS habilitado y no se exponen con la clave pública. El servidor usa `SUPABASE_SECRET_KEY` y requiere `SHOP_ACCESS_PASSWORD` antes de permitir leer o modificar esos datos.

Los aportes manuales nuevos quedan marcados como no verificados y la API limita la cantidad de aportes por IP. El EAN no se fusiona por similitud: para asociar códigos de una misma presentación, se elige la ficha exacta; para otro tamaño/aroma, se crea una variante de la familia.

## Publicar en Vercel

La raíz del proyecto está configurada para `npm run build` y `dist`. Vercel detecta las funciones dentro de `api/`.

Para habilitar ez-catalog, obtené una clave en https://landing.huggian.com/catalog/signup y agregá `EZ_CATALOG_API_KEY` en **Project → Settings → Environment Variables** en Vercel. Aplicala a Production y Preview según corresponda, y luego redeployá. El plan Free publica 50 consultas mensuales; para mayor volumen el servicio ofrece planes pagos.

Si no se configura la clave, la app mantiene activas las otras fuentes y muestra ez-catalog como pendiente de configuración.

## Fuentes de productos

- **SEPA / Precios Claros (catálogo incluido)**: se incorpora un índice por EAN de productos que aparecen en los archivos públicos diarios de supermercados, incluidos productos de limpieza. La carga extrae solo filas identificadas como EAN y evita copiar precios por sucursal. Los archivos se publican en [datos.produccion.gob.ar](https://datos.produccion.gob.ar/dataset/sepa-precios); el espejo comunitario se consulta además en vivo para datos recientes. Los nombres, marcas y presentaciones pueden variar entre comercios.
- **ez-catalog**: servicio comercial argentino; la documentación del proveedor informa que busca en 87 fuentes y que requiere API key. El plan gratuito sirve para probar, con 50 consultas al mes.
- **Open Products Facts**: base colaborativa internacional; la cobertura argentina y de limpieza es variable.
- **Open Beauty Facts**: consulta adicional por EAN para artículos de belleza y cuidado personal, útil para productos Natura/Avon cuando estén cargados.
- **DDI**: catálogo público de distribuidora con EANs para limpieza y hogar; se puede regenerar con `node scripts/import-ddi.mjs`. No se importan precios.
- **UPCitemdb**: catálogo internacional, consultado mediante función de Vercel o el servidor incluido. El plan gratuito informa 100 consultas al día.
- **GS1 Argentina**: la app enlaza a la solicitud de acceso de su API empresarial, que puede devolver GTIN, marca, descripción, imagen y contenido neto. GS1 entrega la documentación al solicitar acceso; la consulta automática requiere esa información y credenciales.
- **Catálogo compartido**: Supabase guarda productos, variantes y códigos alternativos; los EAN se pueden reconocer en cualquier teléfono. Los aportes comunitarios se marcan como no verificados.
- **Inventario del local**: Supabase guarda el stock y el precio propio del negocio. Si la base de datos no está disponible, la app no habilita el acceso ni guarda los cambios localmente.

Las fuentes remotas y los datos del local requieren Internet. La interfaz puede instalarse como aplicación, pero no funciona sin conexión.

## Actualizar el índice SEPA

Descargá el ZIP diario de SEPA y ejecutá en PowerShell:

```powershell
./scripts/import-sepa-cleaning.ps1 -ArchivePath "$env:TEMP\sepa_jueves.zip"
```

El importador recorre los ZIP de comercios, deduplica por EAN, filtra productos de limpieza y escribe fragmentos JSON pequeños en `public/data/sepa-cleaning/`. Se incluye solamente el índice compacto para que no haya que enviar el ZIP original a cada teléfono. El conjunto SEPA declara licencia Creative Commons Atribución 4.0; el índice conserva atribución a Precios Claros / Secretaría de Industria y Comercio.

## Actualizar el índice DDI

```sh
node scripts/import-ddi.mjs
```

Recorre con pausas las páginas públicas de DDI para limpieza, lavandinas, trapos, esponjas y accesorios, extrae EAN y descripción, y escribe fragmentos en `public/data/ddi-cleaning/`. Si el catálogo o su sitio cambia, el importador se detiene con un error en vez de inventar datos.
