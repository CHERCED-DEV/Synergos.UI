#!/usr/bin/env node
/**
 * Gate: los componentes de las apps de vertical se quedan en ~300 líneas de TS y ~200 de plantilla (014-despiece-tienda,
 * T012; spec de 014, regla 1). Lo que pase se parte en subcomponentes con un papel claro:
 * - las obligatorias (`obligatorias` del piso) no tienen ningún componente excedido;
 * - las demás, con un piso que sólo baja: la receta les llega después del piloto de la Tienda.
 *
 * La regla y el cruce viven en `tools/lib/tamano-de-componente.mjs`, que `npm test` ejercita con fixtures. Acá sólo está
 * el recorrido —las fuentes de cada app, con la misma regla de descubrimiento que el build— y el piso.
 *
 *   node tools/tamano-de-componente.mjs               # el gate
 *   node tools/tamano-de-componente.mjs --actualizar  # reescribe el piso con lo que bajó (nunca lo sube)
 *   node tools/tamano-de-componente.mjs --ver=seller  # los componentes de una app, con sus cifras
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATAFORMAS, descubrirFuentes } from './lib/element-sources.mjs';
import { LIMITES, componentesDeLaApp, cruzarConElPiso, excedidos, pisoDe } from './lib/tamano-de-componente.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PISO = join(RAIZ, 'tools', 'tamano-de-componente.piso.json');
const ACTUALIZAR = process.argv.includes('--actualizar');
const VER = process.argv.find((a) => a.startsWith('--ver='))?.slice('--ver='.length);

function fuentes(dir) {
  const salida = [];
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      salida.push(...fuentes(ruta));
    } else if (/\.(ts|html)$/.test(e.name)) {
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
let medidos = 0;
for (const app of apps) {
  const fuente = descubiertas.get(app);
  if (!fuente) continue;
  const componentes = componentesDeLaApp(fuentes(resolve(RAIZ, fuente.dir)));
  medidos += componentes.length;
  const fuera = excedidos(componentes);
  actual[app] = fuera.length;
  const marca = (regla.obligatorias ?? []).includes(app) ? 'obligatoria' : `piso ${regla.piso?.[app] ?? '—'}`;
  const mayor = componentes.reduce((m, c) => (c.ts > m.ts ? c : m), { ts: 0, plantilla: 0, ruta: '' });
  console.log(`  ${app.padEnd(16)} ${String(componentes.length).padStart(3)} componentes · ${fuera.length} excedidos · el mayor ${mayor.ts} TS · ${marca}`);
  if (VER === app) for (const c of componentes) console.log(`      ${String(c.ts).padStart(4)} TS ${String(c.plantilla).padStart(4)} plantilla  ${c.ruta}`);
  for (const e of fuera) if ((regla.obligatorias ?? []).includes(app)) console.log(`      ✗ ${e.ruta}: ${e.motivo}`);
}

// Red de seguridad por el vacío: un recorrido que no ve componentes daría «nadie se pasa, todo verde».
if (Object.keys(actual).length === 0 || medidos === 0) {
  console.error(`✗ el recorrido vio ${Object.keys(actual).length} apps y ${medidos} componentes: está roto, no limpio.`);
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
  ...errores.map((e) => `${e}. Partí el componente en subcomponentes con un papel claro (≤ ${LIMITES.ts} líneas de TS y ≤ ${LIMITES.plantilla} de plantilla); el estado y los casos de uso van a la fachada de su dominio`),
  ...bajaron.map((b) => `bajó — ${b}. Bien: reescribí el piso (--actualizar) en este commit`),
];
if (problemas.length > 0) {
  console.error(`✗ ${problemas.length}:\n  - ${problemas.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(actual).length} apps: ${Object.values(actual).reduce((a, n) => a + n, 0)} componentes excedidos, ninguno en las obligatorias (${(regla.obligatorias ?? []).join(', ')}) y ninguna app sobre su piso`);
