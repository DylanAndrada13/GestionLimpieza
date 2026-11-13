# Limpia · escáner PWA

Una aplicación móvil para identificar códigos EAN/UPC de productos de limpieza y mantener un catálogo propio.

## Ejecutar en desarrollo

```sh
npm install
npm run dev
```

Vite ejecuta localmente la interfaz. En localhost se puede probar la cámara; para escanear desde un teléfono publicado, el sitio debe usar HTTPS.

Para habilitar ez-catalog durante el desarrollo, definí `EZ_CATALOG_API_KEY` en el entorno antes de iniciar Vite. No pongas la clave en el frontend ni la subas al repositorio.

## Publicar en Vercel

La raíz del proyecto está configurada para `npm run build` y `dist`. Vercel detecta las funciones dentro de `api/`.

Para habilitar ez-catalog, obtené una clave en https://landing.huggian.com/catalog/signup y agregá `EZ_CATALOG_API_KEY` en **Project → Settings → Environment Variables** en Vercel. Aplicala a Production y Preview según corresponda, y luego redeployá. El plan Free publica 50 consultas mensuales; para mayor volumen el servicio ofrece planes pagos.

Si no se configura la clave, la app mantiene activas las otras fuentes y muestra ez-catalog como pendiente de configuración.

## Fuentes de productos

- **SEPA / Precios Claros (catálogo incluido)**: se incorpora un índice por EAN de productos que aparecen en los archivos públicos diarios de supermercados, incluidos productos de limpieza. La carga extrae solo filas identificadas como EAN y evita copiar precios por sucursal. Los archivos se publican en [datos.produccion.gob.ar](https://datos.produccion.gob.ar/dataset/sepa-precios); el espejo comunitario se consulta además en vivo para datos recientes. Los nombres, marcas y presentaciones pueden variar entre comercios.
- **ez-catalog**: servicio comercial argentino; la documentación del proveedor informa que busca en 87 fuentes y que requiere API key. El plan gratuito sirve para probar, con 50 consultas al mes.
- **Open Products Facts**: base colaborativa internacional; la cobertura argentina y de limpieza es variable.
- **UPCitemdb**: catálogo internacional, consultado mediante función de Vercel o el servidor incluido. El plan gratuito informa 100 consultas al día.
- **GS1 Argentina / Verified by GS1**: consulta pública enlazada desde la ficha; pide CAPTCHA. GS1 ofrece API para empresas, con acceso y documentación que se solicitan al organismo.
- **Mi catálogo**: los datos agregados se guardan en el navegador de ese dispositivo (`localStorage`); no se sincronizan y se pueden perder al borrar los datos del navegador.

Las fuentes remotas requieren Internet. El catálogo guardado y la interfaz PWA pueden abrirse sin conexión, pero no se pueden hacer consultas externas.

## Actualizar el índice SEPA

Descargá el ZIP diario de SEPA y ejecutá en PowerShell:

```powershell
./scripts/import-sepa-cleaning.ps1 -ArchivePath "$env:TEMP\sepa_jueves.zip"
```

El importador recorre los ZIP de comercios, deduplica por EAN, filtra productos de limpieza y escribe fragmentos JSON pequeños en `public/data/sepa-cleaning/`. Se incluye solamente el índice compacto para que no haya que enviar el ZIP original a cada teléfono. El conjunto SEPA declara licencia Creative Commons Atribución 4.0; el índice conserva atribución a Precios Claros / Secretaría de Industria y Comercio.
