/**
 * Dónde está el repo del CMS, y dónde el árbol del CDN local (#57).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA.
 *
 * `contracts:validate` encadena cinco pasos y **dos necesitan el repo del CMS**.
 * Los dos lo buscaban distinto: `validate-cms-contracts.mjs` aceptaba
 * `--cms-path=`, `SYNERGOS_CMS_PATH` y el hermano; `cms-sync.mjs` aceptaba
 * **sólo dos** — no miraba la variable de entorno.
 *
 * O sea que en un contenedor o en un CI donde los repos no son hermanos,
 * exportar `SYNERGOS_CMS_PATH` hacía pasar `cms:validate` y **dejaba caer
 * `cms:sync:check`**, que es la ÚLTIMA etapa: `contracts:validate` no llegaba al
 * final aunque cada mitad supiera correr.
 *
 * Es el mismo defecto que el CMS documentó desde el otro lado (#86): una
 * disposición de hermanos tratada como requisito, que hace que un agente en un
 * contenedor dé los gates por imposibles. Acá la prosa estaba bien y lo que no
 * cuadraba era **una de las dos herramientas**.
 *
 * **Se promueve al SEGUNDO consumidor, no antes** — que es la regla del repo
 * hermano aplicada con fecha: mientras lo supiera uno solo, una función
 * compartida era abstracción prematura; con dos que tienen que coincidir, dos
 * copias es la que se desvía.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolve } from 'node:path';

/** El nombre del repo hermano, cuando están colocados como tales. */
export const REPO_CMS = 'Synergos.CMS';

/**
 * Resuelve la raíz del CMS: bandera, variable de entorno, hermano.
 *
 * El orden importa y es el que ya tenía el que estaba bien: lo explícito de la
 * línea de comandos gana sobre el entorno, y el entorno sobre la convención.
 * Así una corrida puntual no obliga a exportar nada, y un contenedor no tiene
 * que fingir una disposición de directorios que no tiene.
 *
 * @param {{ raizUi: string, argv?: string[], env?: Record<string,string|undefined> }} io
 * @returns {{ ruta: string, origen: 'bandera'|'entorno'|'hermano' }}
 *   Devuelve **de dónde salió** además de la ruta: un gate que no encuentra su
 *   entrada tiene que poder decir dónde buscó, o el mensaje manda a adivinar.
 */
export function resolverRaizCms({ raizUi, argv = process.argv.slice(2), env = process.env }) {
  const bandera = argv.find((a) => a.startsWith('--cms-path='));
  if (bandera) return { ruta: resolve(bandera.slice('--cms-path='.length)), origen: 'bandera' };

  if (env.SYNERGOS_CMS_PATH) return { ruta: resolve(env.SYNERGOS_CMS_PATH), origen: 'entorno' };

  return { ruta: resolve(raizUi, '..', REPO_CMS), origen: 'hermano' };
}

/** El texto que se le enseña a quien no lo encontró. Nombra las tres formas. */
export function comoApuntarAlCms(intentada) {
  return [
    `No se encontró el repo del CMS en: ${intentada}`,
    'Apuntalo con --cms-path=RUTA, con SYNERGOS_CMS_PATH, o cloná el repo como hermano.',
  ].join('\n');
}

/**
 * La raíz del árbol de CDN local que sirve de fuente a las herramientas de
 * lectura (el catálogo, por ejemplo).
 *
 * **El default deja de ser `C:\\LOCAL_CDN\\synergos`**, que es la otra mitad de
 * este ticket: una ruta que sólo existe en la máquina donde se escribió. Ahora
 * cae a `public/synergos` —la salida de `npm run build:cdn`, que está en este
 * repo y existe en cualquier clon que haya construido—, y `CDN_ROOT` sigue
 * mandando cuando se pasa.
 *
 * No cambia el comportamiento de quien ya lo exporta —`build-cdn.mjs` le pasa el
 * árbol recién publicado— sólo el de quien no, que antes miraba una ruta de
 * Windows y hoy mira la suya.
 */
export function raizCdnLocal({ raizUi, env = process.env }) {
  return env.CDN_ROOT ? resolve(env.CDN_ROOT) : resolve(raizUi, 'public', 'synergos');
}
