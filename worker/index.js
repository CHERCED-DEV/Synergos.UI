import { decorarRespuesta } from '../tools/lib/cdn-cache-policy.mjs';

/**
 * El CDN de Synergos, servido desde Cloudflare Workers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO LO QUE ESTE WORKER HACE ES PONER DOS CABECERAS.
 *
 * Los ficheros los sirve Cloudflare (`env.ASSETS`), que para eso está: es
 * rápido, cachea en el borde y no cuesta invocaciones. Este código existe por
 * una razón concreta y una sola:
 *
 *   `publish.mjs` publica tres rutas hermanas por elemento —`latest/`, la
 *   versión exacta y el alias mayor— y solo la del medio puede llevar
 *   `immutable`. Cloudflare FUSIONA las reglas de `_headers` que se solapan,
 *   uniendo valores repetidos con coma, así que con esas tres hermanas un
 *   `_headers` produciría `Cache-Control: max-age=60, max-age=31536000,
 *   immutable`. Basura.
 *
 * Si algún día la estructura del CDN separa lo inmutable bajo un prefijo
 * propio, este fichero sobra y `_headers` alcanza. Mientras tanto, no.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lo que este Worker NO hace, y es deliberado: no enruta, no reescribe, no
 * decide qué fichero servir. Un CDN que empieza a tener lógica deja de ser un
 * CDN y pasa a ser un servidor que hay que depurar.
 */
export default {
  async fetch(request, env) {
    const respuesta = await env.ASSETS.fetch(request);

    // Un 404 no lleva cabeceras de caché: cachear un "no existe" es cómo se
    // consigue que un bundle recién publicado siga sin existir para alguien.
    // El 304 SÍ (ADR 0140, CMS#201): es la respuesta a una revalidación y lleva
    // la misma política y el mismo CORS que el 200 que revalida. Con `!ok` a
    // secas salía desnudo.
    if (!respuesta.ok && respuesta.status !== 304) return respuesta;

    const { pathname } = new URL(request.url);
    const cabeceras = decorarRespuesta(respuesta.status, pathname);
    if (!cabeceras) return respuesta;

    // La respuesta de ASSETS es inmutable; hay que clonarla para tocar cabeceras.
    const salida = new Response(respuesta.body, respuesta);
    for (const [nombre, valor] of Object.entries(cabeceras)) salida.headers.set(nombre, valor);

    return salida;
  },
};
