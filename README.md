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

- **SEPA / Precios Claros**: consulta por EAN a un espejo comunitario que transforma los archivos de precios que publican los comercios. Incluye productos de limpieza y devuelve descripción, marca, presentación, fecha y cadenas cuando hay datos. El espejo no lo mantiene el Gobierno y puede cambiar o discontinuarse.
- **ez-catalog**: servicio comercial argentino; la documentación del proveedor informa que busca en 87 fuentes y que requiere API key. El plan gratuito sirve para probar, con 50 consultas al mes.
- **Open Products Facts**: base colaborativa internacional; la cobertura argentina y de limpieza es variable.
- **UPCitemdb**: catálogo internacional, consultado mediante función de Vercel o el servidor incluido. El plan gratuito informa 100 consultas al día.
- **GS1 Argentina / Verified by GS1**: consulta pública enlazada desde la ficha; pide CAPTCHA. GS1 ofrece API para empresas, con acceso y documentación que se solicitan al organismo.
- **Mi catálogo**: los datos agregados se guardan en el navegador de ese dispositivo (`localStorage`); no se sincronizan y se pueden perder al borrar los datos del navegador.

Las fuentes remotas requieren Internet. El catálogo guardado y la interfaz PWA pueden abrirse sin conexión, pero no se pueden hacer consultas externas.
