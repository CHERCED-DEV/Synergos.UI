#!/usr/bin/env node
/**
 * La puerta de `wrangler deploy` (ADR 0140, CMS#201): un CDN construido SIN conservar el runtime
 * ya publicado no se despliega.
 *
 *   node tools/cdn-desplegable.mjs                 # sobre public/
 *   node tools/cdn-desplegable.mjs --salida otra/  # sobre otra salida
 *
 * La corre `wrangler.jsonc` (`build.command`) antes de cada `wrangler deploy`, también el que se
 * teclea a mano: es por donde se publicó lo último que no salió del workflow. `build:cdn` con
 * `--sin-conservar` o `SYNERGOS_CDN_CONSERVAR=no` deja su marca en la salida
 * (`MARCA_SIN_CONSERVAR`); sin ella nada distinguía ese `public/` de uno bueno, y el despliegue
 * siguiente tomaba su libro truncado por la verdad. Una salida construida conservando no lleva
 * marca y pasa sin más: esto no pide configurar nada.
 */
import * as fsp from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getArg } from './lib/cli-utils.mjs';
import { revisarDesplegable } from './lib/conservar-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = resolve(ROOT, getArg('salida', 'public'));

const r = await revisarDesplegable({ salida: SALIDA, fs: fsp });
if (!r.ok) {
  console.error(`[cdn-desplegable] ✗ ${r.motivo}`);
  process.exit(1);
}
console.log(`[cdn-desplegable] ✓ ${SALIDA} no lleva la marca de un build:cdn sin conservar: se puede desplegar.`);
