/**
 * tools/lib/runtime-en-desarrollo.mjs
 *
 * CUÁNDO construye `dev:cdn` el runtime compartido (#88).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO, MEDIDO EN UN WORKTREE SIN `dist/`.
 *
 * El runtime (`build-runtime.mjs`) se arma con lo que el build de los elementos
 * deja en `dist/libs/` —`sg-core.js` y `sg-shared.js`—. `dev-cdn` lo construía
 * ANTES de lanzar ese build, así que en un árbol limpio anunciaba «construyéndolo
 * (una vez)…» y moría dos segundos después con «sg-core.js not found». Y no era
 * lo peor: `build-runtime` crea la carpeta de la versión ANTES de comprobar sus
 * entradas, así que dejaba `dist/runtime/<fw>/<versión>/` VACÍA, y la corrida
 * siguiente —que preguntaba si la carpeta existía— la daba por runtime: servía,
 * el banco montaba, y `sg-core.js` contestaba 404. Además, sin `dist/` al arrancar
 * no se instalaba el vigía de `dist/`, así que el runtime no se rehacía nunca.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTO DECIDE, Y POR QUÉ ASÍ.
 *
 * - **El orden sale de la dependencia**: el runtime se construye DESPUÉS de un
 *   build que dejó sus entradas, nunca antes. No hay un «primero esto» escrito:
 *   el arranque lanza el build y espera a que termine.
 * - **Un runtime está si están TODOS sus ficheros**, no si existe su carpeta.
 * - **Se rehace cuando sus entradas CAMBIAN de contenido**, no cuando se tocan:
 *   esbuild reescribe `dist/libs/` en cada build, así que «se escribió un fichero
 *   de libs» era cierto en cada guardado.
 * - **Un build que llega mientras se construye no se pierde**: se apunta y se
 *   vuelve a construir con las entradas nuevas. Antes se descartaba con un
 *   `if (rehaciendoRuntime) return;`, y el runtime se quedaba con las de antes.
 *
 * Todo el I/O se inyecta: el spec arranca desde un árbol sin `dist/` de verdad
 * (`mkdtempSync`), con un build y un `build-runtime` de mentira que se comportan
 * como los reales —el segundo falla sin sus entradas y deja la carpeta vacía—.
 */

import { createHash } from 'node:crypto';

/** El fichero que `build-runtime` escribe el ÚLTIMO: sin él, el runtime está a medias. */
export const MAPA_DEL_RUNTIME = 'import-map.json';

/**
 * ¿Está el runtime ENTERO en `dir`? Una carpeta de versión vacía no es un runtime.
 *
 * @param {{ dir: string|null, ficheros: readonly string[], existe: (p: string) => boolean,
 *           unir: (...p: string[]) => string }} o
 */
export function runtimeCompleto({ dir, ficheros, existe, unir }) {
  if (!dir) return false;
  if (!Array.isArray(ficheros) || ficheros.length === 0) {
    throw new Error('runtimeCompleto sin ficheros: sin lista, cualquier carpeta pasaría por runtime.');
  }
  return [MAPA_DEL_RUNTIME, ...ficheros].every((f) => existe(unir(dir, f)));
}

/**
 * Las ENTRADAS del runtime de una plataforma: los ficheros de su runtime que salen de SUS
 * libs —los `sg-*`, que su build deja en `dist/libs/`—; el resto (`ng-*.js`, `preact.js`…)
 * sale de paquetes de npm y no lo produce ningún build de este repo (UI#91).
 *
 * `dev-cdn` las tenía escritas —`dist/libs/sg-core.js` y `sg-shared.js`, las de Angular—,
 * así que con `--framework=preact` el build terminaba y decía «el build terminó sin dejar
 * las entradas del runtime»: miraba ficheros que Preact no produce (los suyos son
 * `sg-preact-core.js` y `sg-preact-shared.js`). Medido: el banco salía con «No hay runtime
 * compilado» y el runtime contestaba 404. Se derivan de `FICHEROS_POR_FRAMEWORK`, la misma
 * tabla con la que el runtime se publica.
 *
 * @param {{ ficheros: readonly string[], dist: string, unir: (...p: string[]) => string }} o
 */
export function entradasDelRuntime({ ficheros, dist, unir }) {
  const propias = ficheros.filter((f) => f.startsWith('sg-'));
  if (propias.length === 0) {
    throw new Error(
      'entradasDelRuntime: ningún fichero `sg-*` en el runtime de la plataforma. Sin entradas no ' +
        'hay huella, y sin huella el runtime no se construiría nunca — callando.',
    );
  }
  return propias.map((f) => unir(dist, 'libs', f));
}

/**
 * Quién construye el runtime de una plataforma: el `build:runtime` de SU `package.json` si
 * lo declara (Preact), y si no el de la raíz (Angular: su linker vive allá). Es la misma
 * regla con la que lo construye `build-cdn.mjs` (UI#91). `dev-cdn` lanzaba siempre el de la
 * raíz, o sea el de Angular, también con `--framework=preact`.
 *
 * @param {{ raiz: string, dirDeLaPlataforma: string, scriptsDe: (dir: string) => Record<string,string>|undefined }} o
 * @returns {{ args: string[], cwd: string }} lo que se le pasa al lanzador de npm
 */
export function comandoDelRuntime({ raiz, dirDeLaPlataforma, scriptsDe }) {
  const propio = Boolean(scriptsDe(dirDeLaPlataforma)?.['build:runtime']);
  return { args: ['run', 'build:runtime'], cwd: propio ? dirDeLaPlataforma : raiz };
}

/**
 * La huella de CONTENIDO de las entradas del runtime, o `null` si falta alguna.
 *
 * @param {readonly string[]} rutas
 * @param {{ existe: (p: string) => boolean, leer: (p: string) => Buffer|string }} io
 */
export function huellaDeEntradas(rutas, { existe, leer }) {
  if (rutas.length === 0 || !rutas.every((r) => existe(r))) return null;
  const hash = createHash('sha256');
  for (const ruta of rutas) {
    hash.update(ruta);
    hash.update('\0');
    hash.update(leer(ruta));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * El arranque de `dev:cdn`: lanza el build y, tras CADA build que termina, decide
 * si el runtime hay que construirlo.
 *
 * `lanzarBuild(trasUnBuild)` arranca el build de los elementos y llama a
 * `trasUnBuild()` cada vez que uno termina (en watch, uno por guardado).
 * `trasUnBuild` devuelve lo que pasó, para que quien llama decida si recarga:
 *
 *   - `'al-dia'`       el runtime ya estaba construido con estas entradas
 *   - `'construido'`   se construyó (o se rehízo) con las entradas de este build
 *   - `'fallo'`        `construir()` no pudo — el navegador sigue con el anterior
 *   - `'sin-entradas'` el build terminó sin dejar las entradas: no hay con qué
 *   - `'en-curso'`     otro build lo está construyendo; ése se encarga al terminar
 *
 * @param {object} o
 * @param {(trasUnBuild: () => Promise<string>) => void} o.lanzarBuild
 * @param {() => boolean} o.estaCompleto
 * @param {() => string|null} o.huellaDeLasEntradas
 * @param {() => Promise<boolean>} o.construir
 * @param {(m: string) => void} [o.avisar]
 */
export function arrancarRuntimeDeDesarrollo({
  lanzarBuild,
  estaCompleto,
  huellaDeLasEntradas,
  construir,
  avisar = () => {},
}) {
  /** Las entradas con las que se construyó el runtime que se está sirviendo. */
  let usada = null;
  let construyendo = false;
  let pendiente = false;

  async function trasUnBuild() {
    if (construyendo) {
      pendiente = true;
      return 'en-curso';
    }

    const huella = huellaDeLasEntradas();
    if (huella === null) {
      avisar('el build terminó sin dejar las entradas del runtime: no hay con qué construirlo.');
      return 'sin-entradas';
    }
    if (huella === usada && estaCompleto()) return 'al-dia';

    construyendo = true;
    let resultado;
    try {
      avisar(usada === null ? 'construyendo el runtime con este build…' : 'cambió una lib compartida — rehaciendo el runtime…');
      const ok = await construir();
      if (ok && estaCompleto()) {
        usada = huella;
        resultado = 'construido';
      } else {
        avisar('✗ el runtime no se pudo construir — el navegador verá el anterior, si lo hay.');
        resultado = 'fallo';
      }
    } finally {
      construyendo = false;
    }

    if (pendiente) {
      pendiente = false;
      return trasUnBuild();
    }
    return resultado;
  }

  lanzarBuild(trasUnBuild);
  return { trasUnBuild };
}
