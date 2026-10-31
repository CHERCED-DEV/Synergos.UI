#!/usr/bin/env node
/**
 * Gate: las apps de vertical componen los átomos del design system y no escriben controles a mano (014-despiece-tienda,
 * T002; modelo Lego, M-1). Cuenta `<button>`, `<input>`, `<select>` y `<textarea>` en las plantillas de cada app:
 * - las obligatorias (`obligatorias` del piso) no tienen ninguno;
 * - las demás, con un piso que sólo baja (la receta les llega después del piloto de la Tienda).
 *
 * La regla, el detector y el cruce viven en `tools/lib/atomos-en-apps.mjs`, que `npm test` ejercita con fixtures. Acá
 * sólo está el recorrido —las fuentes de cada app, con la misma regla de descubrimiento que el build— y el piso.
 *
 *   node tools/atomos-en-apps.mjs               # el gate
 *   node tools/atomos-en-apps.mjs --actualizar  # reescribe el piso con lo que bajó (nunca lo sube)
 *
 * Una app de vertical nueva entra en el piso con su cifra; el diff del piso va en el commit que lo causó.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATAFORMAS, descubrirFuentes } from './lib/element-sources.mjs';
import { controlesDeLaApp, cruzarConElPiso, pisoDe, suma } from './lib/atomos-en-apps.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PISO = join(RAIZ, 'tools', 'atomos-en-apps.piso.json');
const ACTUALIZAR = process.argv.includes('--actualizar');

function fuentes(dir) {
  const salida = [];
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      salida.push(...fuentes(ruta));
    } else {
      salida.push({ ruta: relative(RAIZ, ruta).replace(/\\/g, '/'), fuente: readFileSync(ruta, 'utf8') });
    }
  }
  return salida;
}

const regla = JSON.parse(readFileSync(PISO, 'utf8'));
const apps = new Set([...(regla.obligatorias ?? []), ...Object.keys(regla.piso ?? {})]);
const descubiertas = descubrirFuentes({
  listar: (dir) => {
    const abs = resolve(RAIZ, dir);
    return existsSync(abs) && statSync(abs).isDirectory()
      ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [];
  },
  existe: (ruta) => existsSync(resolve(RAIZ, ruta)),
  plataformas: PLATAFORMAS,
});

const actual = {};
for (const app of apps) {
  const fuente = descubiertas.get(app);
  if (!fuente) continue;
  const n = controlesDeLaApp(fuentes(resolve(RAIZ, fuente.dir)));
  actual[app] = suma(n);
  const marca = (regla.obligatorias ?? []).includes(app) ? 'obligatoria' : `piso ${regla.piso?.[app] ?? '—'}`;
  console.log(`  ${app.padEnd(16)} ${String(actual[app]).padStart(3)}  (${n.button} button · ${n.input} input · ${n.select} select · ${n.textarea} textarea) · ${marca}`);
}

// Red de seguridad por el vacío: un recorrido que no ve apps daría «0 a mano, todo verde».
if (Object.keys(actual).length === 0) {
  console.error('✗ el recorrido no vio ninguna app: está roto, no limpio.');
  process.exit(1);
}

const { errores, bajaron } = cruzarConElPiso(actual, regla);
if (ACTUALIZAR) {
  if (errores.length > 0) {
    console.error(`✗ el piso no sube:\n  - ${errores.join('\n  - ')}`);
    process.exit(1);
  }
  writeFileSync(PISO, JSON.stringify({ ...regla, piso: pisoDe(actual, regla) }, null, 2) + '\n');
  console.log(`✓ piso reescrito: ${bajaron.length ? bajaron.join(', ') : 'sin cambios'}`);
  process.exit(0);
}

const problemas = [
  ...errores.map((e) => `${e}. Usá los átomos de libs/shared (syn-button, syn-input, syn-select, syn-checkbox, syn-radio, syn-textarea…); si a uno le falta una variante, se añade allí`),
  ...bajaron.map((b) => `bajó — ${b}. Bien: reescribí el piso (--actualizar) en este commit`),
];
if (problemas.length > 0) {
  console.error(`✗ ${problemas.length}:\n  - ${problemas.join('\n  - ')}`);
  process.exit(1);
}
const total = Object.values(actual).reduce((a, n) => a + n, 0);
console.log(`✓ ${Object.keys(actual).length} apps: ${total} controles a mano, ninguno en las obligatorias (${(regla.obligatorias ?? []).join(', ') || '—'}) y ninguna sobre su piso`);
