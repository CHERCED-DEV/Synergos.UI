#!/usr/bin/env node
/**
 * Instala lo que un clon limpio necesita — la raíz y CADA plataforma (#70).
 *
 * `npm ci` en la raíz no alcanza: no hay `workspaces`, y cada plataforma tiene su
 * propio `package.json` y su propio `package-lock.json`. Medido en un clon
 * limpio, sin esto `npm test` muere con `Cannot find module 'sass'` y una traza
 * de `ngtsc.mjs` que no sugiere en ningún momento que falte instalar.
 *
 * La lista de plataformas se DERIVA del disco. El `setup` anterior la tenía
 * escrita a mano y por eso olvidó `platforms/preact` el día que #64 lo creó; la
 * tercera plataforma habría caído en el mismo hueco. Hay gate.
 *
 * Uso:
 *   node tools/setup.mjs              # npm ci en la raíz y en cada plataforma
 *   node tools/setup.mjs --verificar  # no instala: sólo dice qué falta (lo usan
 *                                     # `pretest` y `prebuild`)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './lib/synergos-config.mjs';
import { CARPETA_PLATAFORMAS, frameworksConstruibles } from './lib/frameworks.mjs';
import { sitiosAInstalar, sitiosSinInstalar } from './lib/setup-completo.mjs';

const io = {
  raiz: ROOT,
  carpetaPlataformas: CARPETA_PLATAFORMAS,
  listarDirs: (d) =>
    existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [],
  existe: existsSync,
  unir: join,
};

const sitios = sitiosAInstalar(io, frameworksConstruibles);
const verificar = process.argv.includes('--verificar');

if (verificar) {
  const faltan = sitiosSinInstalar(sitios, io);
  if (faltan.length === 0) process.exit(0);
  console.error(
    `\n[setup] faltan las dependencias de: ${faltan.join(', ')}\n` +
    '        → npm run setup\n\n' +
    '  `npm ci` en la raíz NO instala las plataformas: cada una tiene su propio\n' +
    '  package.json y su propio package-lock.json (#70).\n',
  );
  process.exit(1);
}

console.log(`[setup] ${sitios.length} sitios: ${sitios.map((s) => s.etiqueta).join(', ')}`);
for (const { etiqueta, prefijo } of sitios) {
  const cwd = prefijo === null ? ROOT : join(ROOT, prefijo);
  console.log(`[setup] npm ci en ${etiqueta}…`);
  execFileSync('npm', ['ci'], { cwd, stdio: 'inherit' });
}
console.log('[setup] listo — npm test y npm run build ya pueden correr.');
