/**
 * Qué frameworks hay — y por qué son DOS preguntas, no una (issue #44).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA.
 *
 * El framework es una dimensión de la ruta del CDN —
 * `synergos/<elemento>/<framework>/<versión>/`— y sobrevivió a la purga de
 * 2026-08-04 precisamente para que volviera a haber más de uno. Lo que no
 * sobrevivió fue tratarlo como dimensión: diez de las doce herramientas de
 * `tools/` lo resolvían a la constante `'angular'`, y dos de esas diez son
 * GATES.
 *
 *   > `check-size-budget.mjs` buscaba `<elemento>/angular/latest/main.js` y
 *   > hacía `if (!existsSync(bundle)) continue;`. Un bundle de React no es que
 *   > se pasara del techo: es que **nadie lo medía**, y el gate salía verde.
 *   > `humo-cdn.mjs` pedía `/synergos/<elemento>/angular/latest/meta.json`: el
 *   > humo de un despliegue con dos frameworks certificaba uno.
 *
 * Es la forma de `cdn-smoke` (#9) otra vez — un gate que apunta al sitio
 * equivocado se lee como cobertura — y por eso esta HU va ANTES del wrapper de
 * React (#37): parametrizar después significa que el segundo framework existe
 * un rato sin presupuesto ni humo, y ése es justo el rato en que entra el
 * bundle de 3 MB que nadie ve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS DOS LISTAS, Y CUÁL USA CADA HERRAMIENTA.
 *
 *   1. **CONSTRUIBLES** — una carpeta por plataforma bajo `platforms/`. Es lo
 *      que este repo sabe compilar. La usan quien construye, quien limpia y
 *      quien publica (vía `PLATFORMS`, que además lleva cómo se resuelve el
 *      bundle de cada una).
 *
 *   2. **PUBLICADOS** — el segmento de framework que hay de verdad en el árbol
 *      del CDN, o en las `implementations` del `registry.json` que ese CDN
 *      sirve. Es lo que un visitante descarga. La usan los DOS GATES, y ésa es
 *      la decisión de fondo: un gate mide lo que hay ahí fuera, no lo que el
 *      repo sabe hacer. Medir lo construible dejaría sin techo exactamente al
 *      bundle huérfano que quedó publicado por una plataforma que ya no está.
 *
 * Las dos pueden discrepar en UNA dirección sin que pase nada —construible y
 * todavía no publicado es el estado normal de una plataforma nueva— y nunca en
 * la otra: **publicado y no construible es un huérfano**, y se dice.
 *
 * NINGUNA DE LAS DOS SE ESCRIBE A MANO, Y NINGUNA CAE A `'angular'`. Un default
 * convierte una omisión en una afirmación — es la misma decisión que #42 tomó
 * para el campo `framework` del registry, y por la misma razón.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÓNDE LO CAMBIA #43.
 *
 * #43 decide si el manifiesto pasa a ser la fuente de la lista. Mientras tanto
 * se deriva del disco, y el sitio a tocar es UNO: `frameworksConstruibles`.
 * Por eso ninguna herramienta recorre `platforms/` por su cuenta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** La carpeta del CDN que NO es un elemento: el runtime compartido. */
export const RUNTIME = 'runtime';

/** Dónde viven las plataformas, relativo a la raíz del repo. */
export const CARPETA_PLATAFORMAS = 'platforms';

const unirPorDefecto = (...partes) => partes.join('/');

/**
 * Lo que este repo PUEDE construir, leído del disco.
 *
 * Una plataforma es una carpeta bajo `platforms/` con su propio
 * `package.json` — que es lo que la hace construible, y lo que distingue una
 * plataforma de una carpeta que alguien dejó ahí. El disco se **inyecta** por
 * lo mismo que en `cdn-runtime-check.mjs` y `element-sources.mjs`: es lo que
 * permite ver fallar el gate sin montar un árbol de ficheros de mentira.
 *
 * @param {{ raiz: string, listarDirs: (d: string) => string[],
 *           existe: (r: string) => boolean, unir?: (...p: string[]) => string }} io
 * @returns {string[]} Ordenada, para que el informe no dependa del orden del FS.
 */
export function frameworksConstruibles({ raiz, listarDirs, existe, unir = unirPorDefecto }) {
  const base = unir(raiz, CARPETA_PLATAFORMAS);
  return listarDirs(base)
    .filter((nombre) => existe(unir(base, nombre, 'package.json')))
    .sort();
}

/**
 * La raíz de código de cada plataforma construible (#60).
 *
 * Existe para que los gates que recorren FUENTES —los que viven en un
 * `.spec.mjs`, donde está la ruta de verdad porque las `lib/*.mjs` tienen el
 * disco inyectado— no escriban `platforms/angular` a mano. Cinco de los seis
 * que lo hacían llevan reglas **neutrales** (CSS muerto, un `it.skip` sin
 * motivo, un helper del bridge sin consumidor) apuntando a una ruta cableada:
 * la regla 25, un gate que resuelve a una constante una dimensión de lo que
 * mide y se pone verde sobre el sitio equivocado.
 *
 * **Lo que esto NO resuelve, y va dicho en vez de insinuado:** una plataforma
 * cuyo árbol interno no se parezca al de Angular —`apps/elements/<tier>s/`,
 * `libs/`— queda INVISIBLE para esos gates, porque cada uno sigue sabiendo qué
 * subcarpeta mirar. El contrato de layout de una plataforma es #62; hasta
 * entonces lo honesto es que el gate recorra lo que existe y que su red de
 * seguridad exija haber encontrado algo, no fingir que cubre un árbol que nadie
 * ha descrito todavía.
 *
 * @param {{ raiz: string, listarDirs: (d: string) => string[],
 *           existe: (r: string) => boolean, unir?: (...p: string[]) => string }} io
 * @returns {{ framework: string, raiz: string }[]}
 */
export function raicesDePlataformas({ raiz, listarDirs, existe, unir = unirPorDefecto }) {
  return frameworksConstruibles({ raiz, listarDirs, existe, unir }).map((framework) => ({
    framework,
    raiz: unir(raiz, CARPETA_PLATAFORMAS, framework),
  }));
}

/**
 * Lo mismo, cableado al disco de verdad, para los `.spec.mjs` (#60).
 *
 * Los gates puros de `tools/lib/*.mjs` inyectan el disco porque así se pueden
 * ver fallar; los que recorren fuentes viven en un `.spec.mjs` y ahí el disco es
 * el de verdad. Esta envoltura existe para que ese recorrido sea **una línea** y
 * no veinticinco copiadas cinco veces: una tabla duplicada se desvía, que es el
 * defecto que #58 acaba de pagar con el import map.
 *
 * @param {string} raiz Raíz del repo.
 * @returns {string[]} Las rutas absolutas de cada plataforma construible.
 */
export function raicesEnDisco(raiz) {
  return raicesDePlataformas({
    raiz,
    listarDirs: (d) =>
      existsSync(d)
        ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        : [],
    existe: existsSync,
    unir: join,
  }).map((p) => p.raiz);
}

/**
 * Cruza las plataformas del DISCO contra las que `PLATFORMS` declara.
 *
 * Existe porque `PLATFORMS` no se puede derivar entera: lleva además cómo se
 * resuelve el bundle de cada plataforma (`dist/<el>/browser/main.js` en
 * Angular), y eso el disco no lo dice. Lo que sí se puede exigir es que las
 * dos listas nombren a los mismos, EN LOS DOS SENTIDOS:
 *
 *   - **carpeta sin entrada** → la plataforma existe y el pipeline no la ve.
 *     Es el modo de fallo silencioso que abre esta HU: se construye a mano, se
 *     publica a mano, y ni el presupuesto ni el humo se enteran.
 *   - **entrada sin carpeta** → se publicaría un slot de CDN que nadie
 *     construye. Es lo que quedó de la purga y lo que hay que evitar repetir.
 *
 * @returns {string[]} Líneas de error. Vacío es que cuadra.
 */
export function revisarPlataformas(enDisco, declaradas) {
  const errores = [];

  for (const nombre of enDisco) {
    if (!declaradas.includes(nombre)) {
      errores.push(
        `platforms/${nombre}/ existe y PLATFORMS no lo declara (tools/lib/synergos-config.mjs). ` +
          `El pipeline entero lo ignoraría: ni se limpia, ni se publica, ni se mide.`,
      );
    }
  }

  for (const nombre of declaradas) {
    if (!enDisco.includes(nombre)) {
      errores.push(
        `PLATFORMS declara "${nombre}" y no hay platforms/${nombre}/ con package.json. ` +
          `Se publicaría un slot de CDN que nadie construye.`,
      );
    }
  }

  return errores;
}

/**
 * Los bundles que hay de verdad en un árbol de CDN, uno por elemento y framework.
 *
 * Aquí está el corte del ticket: antes se PREGUNTABA por
 * `<elemento>/angular/latest/main.js` y se seguía de largo si no estaba. Ahora
 * se **recorre** lo que hay, que es lo único que puede encontrar un framework
 * que nadie escribió en ningún sitio.
 *
 * Los dos rechazos, y ninguno es un aviso:
 *
 *   - **un elemento sin ningún bundle en ningún framework** → antes lo saltaba
 *     un `continue`. Una carpeta de elemento en el CDN sin nada dentro es un
 *     publish a medias, y salta 404 en la cara del visitante; esconderlo detrás
 *     de un `continue` es lo que permitía que el gate contara 127 elementos
 *     medidos sobre un CDN con 128 carpetas.
 *   - **un framework publicado que no es construible** → un huérfano de una
 *     plataforma que ya no está. Se nombra: el bundle sigue ahí fuera,
 *     sirviéndose, sin nadie que lo reconstruya.
 *
 * **`construibles` es opcional a propósito** (#61). Quien quiere el censo entero
 * lo pasa y se lleva el aviso del huérfano; quien sólo necesita saber QUÉ
 * frameworks publicaron elementos —`cdn-runtime-check.mjs`, para exigirle
 * runtime a cada uno— lo omite, y así no hay una segunda copia de la regla de
 * qué cuenta como bundle publicado. Con dos copias, la de al lado se desvía: es
 * literalmente el defecto de la tabla del import map de #58.
 *
 * @param {{ raizCdn: string, construibles?: string[] | null,
 *           listarDirs: (d: string) => string[], existe: (r: string) => boolean,
 *           unir?: (...p: string[]) => string }} io
 * @returns {{ bundles: { elemento: string, framework: string, ruta: string }[],
 *             frameworks: string[], errores: string[] }}
 */
export function recorrerPublicado({ raizCdn, construibles = null, listarDirs, existe, unir = unirPorDefecto }) {
  const bundles = [];
  const errores = [];
  const frameworks = new Set();

  for (const elemento of listarDirs(raizCdn).sort()) {
    // `runtime/` es el paquete compartido, no un elemento: no tiene tier, no
    // tiene techo y pesa lo que pesa el framework a propósito.
    if (elemento === RUNTIME) continue;

    const encontrados = [];

    for (const framework of listarDirs(unir(raizCdn, elemento)).sort()) {
      const ruta = unir(raizCdn, elemento, framework, 'latest', 'main.js');
      if (!existe(ruta)) continue;

      encontrados.push(framework);
      frameworks.add(framework);
      bundles.push({ elemento, framework, ruta });

      if (construibles !== null && !construibles.includes(framework)) {
        errores.push(
          `${elemento}: publicado bajo el framework "${framework}", que ninguna plataforma ` +
            `construye (hay: ${construibles.join(', ') || '(ninguna)'}). Es un huérfano: el ` +
            `bundle se sigue sirviendo y nadie puede reconstruirlo.`,
        );
      }
    }

    if (encontrados.length === 0) {
      const dentro = listarDirs(unir(raizCdn, elemento));
      errores.push(
        `${elemento}: carpeta publicada SIN ningún bundle en ningún framework ` +
          `(dentro hay: ${dentro.join(', ') || '(nada)'}). Es un publish a medias — antes ` +
          `un \`continue\` lo saltaba y el gate lo daba por medido.`,
      );
    }
  }

  return { bundles, frameworks: [...frameworks].sort(), errores };
}

/**
 * Los frameworks que declara un `registry.json` ya servido por el CDN.
 *
 * Es la misma pregunta que `recorrerPublicado` con otra fuente: el humo no
 * tiene el disco delante, tiene HTTP. Lo que no cambia es que **no se
 * adivina**: si el registry no declara implementaciones, no hay nada que
 * comprobar y se dice, en vez de pedir `/angular/` y reportar un 404 como si
 * fuera un despliegue roto.
 *
 * @param {{ elements?: Array }} registry
 * @returns {string[]}
 */
export function frameworksDelRegistry(registry) {
  const frameworks = new Set();
  for (const entrada of registry?.elements ?? []) {
    for (const [fw, info] of Object.entries(entrada?.implementations ?? {})) {
      if (info?.latest) frameworks.add(fw);
    }
  }
  return [...frameworks].sort();
}
