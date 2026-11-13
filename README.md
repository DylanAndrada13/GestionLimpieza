# Limpia · escáner PWA

Una base móvil para escanear códigos EAN/UPC de productos de limpieza y mantener un catálogo propio.

## Ejecutar en desarrollo

```sh
npm install
npm run dev
```

Vite abre la página de desarrollo. En `localhost` se puede probar la cámara; para escanear desde otro teléfono hace falta abrir el sitio por HTTPS.

## Publicar

```sh
npm run build
npm start
```

`npm start` sirve la PWA compilada en el puerto indicado por `PORT` (4173 por defecto) e incluye el puente del servidor para UPCitemdb. Publicala detrás de HTTPS en un host que ejecute Node.js. Un hosting solo estático no sirve para la consulta UPC porque su API bloquea las llamadas directas del navegador.

La pantalla se puede instalar desde el menú de compartir de Safari en iPhone o desde el menú de Chrome en Android. Los archivos `public/manifest.webmanifest`, `public/sw.js` y `public/icon.svg` definen la PWA y su caché de interfaz.

## Fuentes

- **Open Products Facts**: consulta automática por código. Base abierta colaborativa y global; cobertura local variable.
- **UPCitemdb**: consulta automática a través de `server.js`. Su plan gratuito informa un límite de 100 consultas diarias y límites de frecuencia; puede agotarse.
- **GS1 Argentina / Verified by GS1**: búsqueda pública vinculada desde cada resultado. La consulta web pide CAPTCHA, por eso se abre manualmente. GS1 Argentina ofrece una API empresarial, pero requiere solicitar acceso y recibir la documentación; no se simula una integración sin credenciales.
- **Mi catálogo**: los productos que se agregan se guardan en `localStorage` en ese teléfono/navegador. No se sincronizan entre dispositivos y se pierden si se borran los datos del navegador.

Las APIs necesitan Internet. La PWA guarda la interfaz para abrirla sin conexión y permite consultar/usar el catálogo local; no puede consultar fuentes remotas desconectada.
