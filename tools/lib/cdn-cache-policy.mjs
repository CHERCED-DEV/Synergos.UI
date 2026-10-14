/**
 * Cuánto tiempo puede cachear un navegador cada cosa que publicamos al CDN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES CÓDIGO Y NO UN FICHERO `_headers`.
 *
 * `publish.mjs` publica TRES rutas hermanas por elemento:
 *
 *     synergos/<elemento>/<framework>/latest/main.js     ← se mueve
 *     synergos/<elemento>/<framework>/0.1.0/main.js      ← NUNCA se mueve
 *     synergos/<elemento>/<framework>/v0/main.js         ← se mueve
 *
 * Solo la del medio puede llevar `immutable`. Y Cloudflare **fusiona** las
 * reglas de `_headers` que se solapan: si una cabecera aparece dos veces, une
 * los valores con coma. Con estas tres rutas hermanas no hay glob que las
 * separe, así que un `_headers` produciría
 * `Cache-Control: max-age=60, max-age=31536000, immutable` — basura.
 *
 * Quince líneas mirando la ruta sí las separan.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * EL ERROR QUE ESTO EXISTE PARA EVITAR, y es el más caro del CDN:
 *
 *   > Poner `immutable` en una ruta que se mueve significa publicar una versión
 *   > nueva y que **nadie la vea durante un año**. No falla, no avisa, y no se
 *   > arregla purgando la caché — la caché está en el navegador de cada
 *   > visitante, y no la controlamos.
 *
 * Por eso el default es el conservador: ante la duda, caché corta. Una caché
 * corta de más cuesta ancho de banda; una larga de más cuesta el producto.
 */

/** Un año. Lo máximo que la especificación recomienda. */
export const UN_ANO = 31_536_000;

/** Lo que se cachea corto: suficiente para una ráfaga, nada para un despliegue. */
export const CORTO = 300;

/** El índice: es lo que hay que releer para enterarse de que salió algo nuevo. */
export const INDICE = 60;

/**
 * Los nombres de carpeta que **se mueven** — apuntan a otra cosa con el tiempo.
 *
 * `latest` es obvio. Los alias mayores (`v0`, `v1`, …) también: el sentido de
 * un alias mayor es que siga a la última compatible.
 */
const SE_MUEVE = /^(latest|v\d+)$/;

/** Un segmento que es una versión exacta — `0.1.0`, `1.4.2-rc.1`. Esos no se mueven. */
const VERSION_EXACTA = /^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/;

/**
 * La carpeta del CDN que no es un elemento: el runtime compartido. Es el mismo
 * nombre que `RUNTIME` de `frameworks.mjs` y `CARPETA_RUNTIME` de
 * `mapa-del-runtime.mjs` (el spec los cruza); se repite acá para que el Worker
 * no cargue esas tablas.
 */
export const RUNTIME = 'runtime';

/**
 * Un fichero del runtime con la huella de sus bytes en el nombre:
 * `<stem>.<16 hex en minúsculas>.js` (`sg-shared.18a9decbae7fffb0.js`).
 *
 * Es UNA regex para la política y para el publicador
 * (`runtime-por-contenido.mjs`), y la misma que `PoliticaDeCacheDelCdnLocal`
 * del CMS: lo que el publicador nombra con huella es exactamente lo que las dos
 * políticas sirven `immutable` (ADR 0140, CMS#201).
 */
export const HUELLA_EN_NOMBRE = /^[a-z0-9-]+\.[0-9a-f]{16}\.m?js$/;

/**
 * La cabecera `Cache-Control` que le corresponde a una ruta.
 *
 * @param {string} pathname Ruta de la petición, con barra inicial.
 * @returns {string} El valor de `Cache-Control`.
 */
export function cacheControlFor(pathname) {
  const segmentos = pathname.split('/').filter(Boolean);

  // El índice global. Cachearlo mucho es lo mismo que no publicar: el CMS lo
  // relee para enterarse de qué versiones hay.
  if (pathname === '/synergos/registry.json') {
    return `public, max-age=${INDICE}, must-revalidate`;
  }

  // Cualquier segmento que se mueva descalifica la ruta entera, esté donde
  // esté. Se mira TODA la ruta y no solo una posición fija a propósito: el día
  // que la estructura cambie de profundidad —y el runtime ya tiene otra
  // (`synergos/runtime/angular/<ver>/`)— la regla sigue siendo cierta.
  if (segmentos.some((s) => SE_MUEVE.test(s))) {
    return `public, max-age=${CORTO}, must-revalidate`;
  }

  // El runtime compartido es la excepción a «versión exacta = inmutable». Su
  // carpeta (`runtime/angular/21.1.6/`) lleva la versión de su FRAMEWORK, no la
  // de su contenido: `publish:runtime` la reescribe cada vez que cambia
  // `libs/shared`, y con la regla de abajo salía `immutable` por tener forma de
  // versión — quien ya tenía el `sg-shared.js` viejo se quedaba con él un año
  // (ADR 0140, CMS#201). Acá sólo la huella del nombre prueba el contenido: con
  // ella, un año; sin ella (los planos, su `import-map.json`), corto.
  if (segmentos[1] === RUNTIME) {
    return HUELLA_EN_NOMBRE.test(segmentos.at(-1) ?? '')
      ? `public, max-age=${UN_ANO}, immutable`
      : `public, max-age=${CORTO}, must-revalidate`;
  }

  // Inmutable SOLO si algo en la ruta dice qué versión exacta es. Sin esa
  // prueba positiva no se promete nada: el default es el conservador.
  if (segmentos.some((s) => VERSION_EXACTA.test(s))) {
    return `public, max-age=${UN_ANO}, immutable`;
  }

  return `public, max-age=${CORTO}, must-revalidate`;
}

/**
 * Si esta ruta la puede pedir otro origen.
 *
 * <b>El CDN existe para ser consumido desde otro dominio</b> — el CMS corre en
 * un servidor distinto. Sin CORS, el navegador descarga el bundle y luego se
 * niega a ejecutarlo, con un error que no menciona el CDN.
 */
export function corsFor(pathname) {
  return pathname.startsWith('/synergos/') ? '*' : null;
}

/**
 * Las cabeceras que el Worker le pone a una respuesta, o `null` si no lleva.
 *
 * El 304 lleva LAS MISMAS que el 200 (ADR 0140, CMS#201). Es la respuesta a
 * una revalidación —`latest/import-map.json`, un plano del runtime—, y el
 * navegador actualiza con sus cabeceras las que tenía guardadas: un 304 sin
 * política ni CORS es una revalidación que llega distinta del 200 que la
 * precedió. Un 404 (o un 5xx) no lleva ninguna: cachear un «no existe» es
 * cómo se consigue que un bundle recién publicado siga sin existir para alguien.
 *
 * @param {number} status El estado de la respuesta de los assets.
 * @param {string} pathname Ruta de la petición, con barra inicial.
 * @returns {Record<string,string> | null}
 */
export function decorarRespuesta(status, pathname) {
  const exito = status >= 200 && status < 300;
  if (!exito && status !== 304) return null;

  const cabeceras = { 'Cache-Control': cacheControlFor(pathname) };
  const cors = corsFor(pathname);
  if (cors) cabeceras['Access-Control-Allow-Origin'] = cors;
  return cabeceras;
}
