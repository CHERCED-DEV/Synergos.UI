/**
 * ¿Está el runtime compartido en el CDN?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UNA FUNCIÓN Y NO DOS `existsSync` SUELTOS.
 *
 * La comprobación vivía cableada dentro de `publish.mjs`, y ahí no se podía
 * probar: para verla decir «falta el runtime» había que tener un CDN a medias
 * en el disco. Así que nadie la probó nunca — y durante meses **mintió en cada
 * build** sin que nada se pusiera rojo (issue #7).
 *
 * El defecto era de ORDEN: `build-cdn.mjs` llamaba a `publish.mjs` —que
 * pregunta— antes de `publish-runtime.mjs` —que responde—. La pregunta llegaba
 * veinte líneas antes que la respuesta, y la contestaba con la verdad de ese
 * instante: todavía no estaba.
 *
 *   > Un `⚠` que siempre sale y nunca significa nada entrena a saltarse los
 *   > `⚠` — incluidos los de la vez que sí. El coste no es ese aviso: es el
 *   > próximo aviso real que nadie va a leer.
 *
 * Sacarla acá la vuelve probable con un mapa de ficheros de mentira, y permite
 * que la usen los dos que la necesitan: el publicador, que avisa, y
 * `build-cdn.mjs`, que **falla** — porque build-cdn es quien publica el
 * runtime, así que si al terminar no está, no es un aviso: es un despliegue
 * roto.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LO QUE NO HAY QUE HACER: borrar la comprobación. Existe por una razón buena.
 * Un CDN con elementos y sin runtime carga los bundles y **se rompe al
 * arrancar**, con un error que habla de módulos y no dice «falta el runtime».
 */

/** El runtime está publicado y con su slot móvil al día. */
export const OK = 'ok';

/** No hay runtime de ninguna versión. Los elementos no van a arrancar. */
export const SIN_RUNTIME = 'sin-runtime';

/** Hay runtime, pero `latest/` no apunta a nada. Quien pida `latest` se queda sin él. */
export const SIN_LATEST = 'sin-latest';

/**
 * Revisa el estado del runtime dentro de la carpeta `synergos/` de un CDN.
 *
 * La comprobación de ficheros se **inyecta** en vez de importarse: es lo que
 * permite probar los tres estados sin montar un CDN falso en el disco.
 *
 * @param {string} cdnSynergos Ruta a la carpeta `synergos/` del CDN.
 * @param {(ruta: string) => boolean} existe Predicado de existencia (`existsSync`).
 * @returns {{ estado: string, lineas: string[] }} Veredicto y qué decirle a quien mira.
 */
export function revisarRuntime(cdnSynergos, existe) {
  // Se unen con `/` a mano en vez de con `join`: la función no toca el disco,
  // y quien la llama de verdad pasa una ruta absoluta del sistema que sea.
  const base = `${cdnSynergos}/runtime/angular`;
  const hayAlguno = existe(base);
  const hayLatest = existe(`${base}/latest/import-map.json`);

  if (!hayAlguno && !hayLatest) {
    return {
      estado: SIN_RUNTIME,
      lineas: [
        'Angular runtime NOT found in CDN.',
        'Run first: node tools/build-runtime.mjs && node tools/publish-runtime.mjs',
        'Angular elements will NOT work without the shared runtime.',
      ],
    };
  }

  if (!hayLatest) {
    return {
      estado: SIN_LATEST,
      lineas: ["Runtime exists but 'latest' slot is missing. Consider re-publishing runtime."],
    };
  }

  return { estado: OK, lineas: [] };
}
