/**
 * ¿Está el runtime compartido en el CDN? — y el de CADA framework que publicó.
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y POR QUÉ DEJÓ DE PREGUNTAR POR `runtime/angular` (#61).
 *
 * Preguntaba, literal, por `${cdnSynergos}/runtime/angular/latest/…`. Estaba en
 * el censo de #44 como *legítimamente de Angular*, y **lo era mientras hubiera
 * una sola plataforma**: es la regla 26(b) del CLAUDE.md — una excepción
 * «legítimamente de X» caduca el día que hay dos X. Con dos, publicar los
 * elementos de React sin su runtime pasaba **en verde**, y lo que eso produce
 * está escrito tres párrafos más abajo: los bundles cargan y se rompen al
 * arrancar, con un error que habla de módulos y no dice «falta el runtime».
 *
 * **LA ASIMETRÍA ES EL DISEÑO, no un descuido.** La pregunta NO es «¿está el
 * runtime de las plataformas construibles?» sino **«¿tiene runtime cada
 * framework que publicó ELEMENTOS?»**. Un framework construible que todavía no
 * publicó nada no da rojo — es el estado normal de una plataforma nueva, y es
 * la decisión de las dos listas de #44 aplicada acá. Al revés daría rojo el día
 * que alguien crea `platforms/react/` y antes de su primer publish, o sea
 * exactamente cuando el gate tiene que estar callado.
 *
 * Y la lista se **RECORRE** (`recorrerPublicado`), no se enumera: recorrer es lo
 * único que encuentra un framework que nadie escribió en ningún sitio.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LO QUE NO HAY QUE HACER: borrar la comprobación. Existe por una razón buena.
 * Un CDN con elementos y sin runtime carga los bundles y **se rompe al
 * arrancar**, con un error que habla de módulos y no dice «falta el runtime».
 */

import { recorrerPublicado, RUNTIME } from './frameworks.mjs';

/** El runtime está publicado y con su slot móvil al día, para todos los que publicaron. */
export const OK = 'ok';

/** A algún framework con elementos publicados no le llegó el runtime. No van a arrancar. */
export const SIN_RUNTIME = 'sin-runtime';

/** Hay runtime, pero `latest/` no apunta a nada. Quien pida `latest` se queda sin él. */
export const SIN_LATEST = 'sin-latest';

const unirPorDefecto = (...partes) => partes.join('/');

/**
 * Revisa el estado del runtime dentro de la carpeta `synergos/` de un CDN.
 *
 * El disco se **inyecta** en vez de importarse: es lo que permite probar los
 * tres estados sin montar un CDN falso.
 *
 * La firma pasó de dos posicionales a un objeto en #61, porque la pregunta dejó
 * de ser «¿existe esta ruta?» para ser «¿qué frameworks publicaron y le llegó
 * el runtime a cada uno?», y eso necesita recorrer.
 *
 * @param {{ cdnSynergos: string, existe: (r: string) => boolean,
 *           listarDirs: (d: string) => string[],
 *           unir?: (...p: string[]) => string }} io
 * @returns {{ estado: string, lineas: string[], frameworks: string[], faltan: string[] }}
   Donde `frameworks` son los que publicaron elementos y `faltan` los que se quedaron sin
   runtime (o sin `latest`). Se devuelven en vez de dejarlos sólo dentro de la prosa: un test
   que tenga que sacar la lista de un mensaje con un regex acaba afirmando la redacción.
 */
export function revisarRuntime({ cdnSynergos, existe, listarDirs, unir = unirPorDefecto }) {
  // Sin `construibles`: acá no se juzga si la plataforma existe todavía —eso es
  // trabajo de `revisarPlataformas`—, sólo QUIÉN publicó elementos.
  const { frameworks } = recorrerPublicado({ raizCdn: cdnSynergos, listarDirs, existe, unir });

  // Un CDN sin un solo elemento publicado no tiene a quién exigirle runtime. No
  // es «ok porque sí»: es que la pregunta no aplica, y contestar SIN_RUNTIME
  // convertiría un árbol vacío en un despliegue roto.
  if (frameworks.length === 0) {
    return { estado: OK, lineas: [], frameworks: [], faltan: [] };
  }

  const sinRuntime = [];
  const sinLatest = [];

  for (const framework of frameworks) {
    const base = unir(cdnSynergos, RUNTIME, framework);
    if (!existe(base)) {
      sinRuntime.push(framework);
      continue;
    }
    if (!existe(unir(base, 'latest', 'import-map.json'))) sinLatest.push(framework);
  }

  if (sinRuntime.length > 0) {
    return {
      estado: SIN_RUNTIME,
      frameworks,
      faltan: sinRuntime,
      lineas: [
        `Runtime NOT found in CDN for: ${sinRuntime.join(', ')} ` +
          `(con elementos publicados: ${frameworks.join(', ')}).`,
        'Run first: node tools/build-runtime.mjs && node tools/publish-runtime.mjs',
        'Sus elementos cargarán y se romperán al arrancar, con un error que habla de módulos.',
      ],
    };
  }

  if (sinLatest.length > 0) {
    return {
      estado: SIN_LATEST,
      frameworks,
      faltan: sinLatest,
      lineas: [
        `Runtime de ${sinLatest.join(', ')} publicado sin su slot 'latest'. ` +
          `Quien pida latest/import-map.json se queda sin mapa — y sin mapa no hidrata nada.`,
      ],
    };
  }

  return { estado: OK, lineas: [], frameworks, faltan: [] };
}
