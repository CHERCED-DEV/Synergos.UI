#!/usr/bin/env node
/**
 * La puerta de `wrangler deploy` (ADR 0140, CMS#201): sólo se despliega una salida que `build:cdn`
 * TERMINÓ, para este commit, sin tocar después y conservando el runtime ya publicado.
 *
 *   node tools/cdn-desplegable.mjs                 # sobre public/
 *   node tools/cdn-desplegable.mjs --salida otra/  # sobre otra salida
 *
 * La corre `wrangler.jsonc` (`build.command`) antes de cada `wrangler deploy`, también el que se
 * teclea a mano: es por donde se publicó lo último que no salió del workflow. Dos reglas:
 *
 *   1. La salida lleva el SELLO de `build:cdn` y cuadra (`tools/lib/sello-del-cdn.mjs`). Hasta el
 *      2026-10-15 esto no se miraba, y era lo que hacía rojo a Workers Builds en 60 de 60 push: corría
 *      `wrangler deploy` sin construir y esta puerta contestaba «se puede desplegar» sobre un `public/`
 *      que no existía. Peor que eso era el caso que no fallaba: un `public/` A MEDIAS se habría
 *      publicado entero, porque los assets de Workers reemplazan la CDN de un golpe.
 *   2. La salida no lleva la marca de un `build:cdn` SIN conservar (`MARCA_SIN_CONSERVAR`): sin ella
 *      nada distinguía ese `public/` de uno bueno, y el despliegue siguiente tomaba su libro
 *      truncado por la verdad.
 */
import * as fsp from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getArg } from './lib/cli-utils.mjs';
import { revisarDesplegable } from './lib/conservar-runtime.mjs';
import { revisarSalida } from './lib/sello-del-cdn.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = resolve(ROOT, getArg('salida', 'public'));

/** El commit que se está desplegando, o `null` si no hay git (entonces la puerta lo dice). */
function commitDeHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

const salida = await revisarSalida({ salida: SALIDA, fs: fsp, commit: commitDeHead() });
if (!salida.ok) {
  console.error(`[cdn-desplegable] ✗ ${salida.motivo}`);
  process.exit(1);
}
if (salida.aviso) console.warn(`[cdn-desplegable] ⚠ ${salida.aviso}`);

const r = await revisarDesplegable({ salida: SALIDA, fs: fsp });
if (!r.ok) {
  console.error(`[cdn-desplegable] ✗ ${r.motivo}`);
  process.exit(1);
}

const { commit, ficheros } = salida.sello;
console.log(
  `[cdn-desplegable] ✓ ${SALIDA}: \`build:cdn\` terminada${commit ? ` en ${commit.slice(0, 7)}` : ''}, ` +
    `${ficheros} ficheros sin tocar, conservando el runtime publicado: se puede desplegar.`,
);
