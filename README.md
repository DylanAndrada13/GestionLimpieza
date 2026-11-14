# CleanStock · escáner PWA

Aplicación móvil para escanear códigos EAN/UPC de productos de limpieza, mantener el inventario del local con stock y precio, y registrar compras descontando unidades automáticamente.

## Ejecutar en desarrollo

```sh
npm install
npm run dev
```

Vite ejecuta localmente la interfaz. En localhost se puede probar la cámara; para escanear desde un teléfono publicado, el sitio debe usar HTTPS.

Para habilitar ez-catalog durante el desarrollo, definí `EZ_CATALOG_API_KEY` en el entorno antes de iniciar Vite. No pongas la clave en el frontend ni la subas al repositorio.

## Catálogo compartido con Supabase

1. Creá un proyecto Supabase en el plan Free.
2. En **SQL Editor**, ejecutá el contenido de `supabase/schema.sql`.
3. En **Project Settings → API Keys**, copiá la URL del proyecto y la **Secret key** (`sb_secret_...`). También se admite la clave JWT anterior `service_role`.
4. En Vercel, agregá `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en **Settings → Environment Variables** para Production y Preview. La clave secreta solo se usa en funciones server-side, nunca como `VITE_*` ni en el navegador.
5. Volvé a desplegar la app. Las fichas nuevas y los EAN asociados se comparten entre teléfonos; la pantalla sigue guardando una copia local para uso sin conexión.
6. En un entorno con Node, cargá esas dos variables en `.env.local` (archivo ignorado por Git) y corré `node scripts/sync-catalog-to-supabase.mjs` para importar los catálogos SEPA y DDI.

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
- **Catálogo del teléfono**: se mantiene una copia local para consultas sin conexión y sigue disponible si Supabase no está configurado.

Las fuentes remotas requieren Internet. El catálogo guardado y la interfaz PWA pueden abrirse sin conexión, pero no se pueden hacer consultas externas.

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
