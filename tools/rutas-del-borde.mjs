#!/usr/bin/env node
/**
 * Gate cross-repo: toda ruta que un `*-api.client.ts` pide existe en el borde del CMS (#77).
 *
 * El razonamiento, el censo y el cruce viven en `tools/lib/rutas-del-borde.mjs`, que es lo que
 * `npm test` ejercita sin disco ni red. Acá sólo está el recorrido.
 *
 * Necesita el repo del CMS, y sin él **rechaza**: en la lista de checks un «no pude comprobar»
 * se lee igual que un «no aplica». Por eso vive en `design-gates-ui.yml`, que lo chequea.
 *
 * Uso: node tools/rutas-del-borde.mjs [--cms-path=RUTA]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATAFORMAS } from './lib/element-sources.mjs';
import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';
import { SIN_BORDE, SUFIJO_CLIENTE, cruzarRutas, rutasQueDeclara, rutasQuePide } from './lib/rutas-del-borde.mjs';

const RAIZ_UI = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Dónde declara el CMS sus bordes. */
const CONTROLLERS = join('Synergos.CMS.Web', 'Controllers');

function ficheros(dir, salida = []) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return salida;
  }
  for (const e of entradas) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      ficheros(ruta, salida);
    } else if (e.isFile()) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** La fuente sin comentarios: una ruta citada en prosa no es una ruta que se pida. */
function desnuda(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const { ruta: raizCms, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
const carpetaControllers = join(raizCms, CONTROLLERS);

if (!existsSync(carpetaControllers)) {
  console.error('✗ No se pudo comprobar las rutas contra el borde del CMS.');
  console.error(`  Se buscó en (${origen}): ${carpetaControllers}`);
  console.error(comoApuntarAlCms(raizCms));
  console.error('  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO.');
  process.exit(1);
}

// ── lo que los clientes piden ───────────────────────────────────────────────
const clientes = [];
for (const plataforma of PLATAFORMAS) {
  const apps = join(RAIZ_UI, plataforma.apps);
  try {
    if (!statSync(apps).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const f of ficheros(apps)) {
    if (!f.endsWith(SUFIJO_CLIENTE)) continue;
    const vertical = f.slice(0, -SUFIJO_CLIENTE.length).split(/[\\/]/).pop();
    clientes.push({ vertical, rutas: rutasQuePide(desnuda(readFileSync(f, 'utf8'))) });
  }
}

// ── lo que el borde declara ─────────────────────────────────────────────────
const declaradas = [];
for (const f of ficheros(carpetaControllers)) {
  if (!f.endsWith('.cs')) continue;
  declaradas.push(...rutasQueDeclara(desnuda(readFileSync(f, 'utf8'))));
}

const { fallos, medidas, ausentes } = cruzarRutas(clientes, declaradas, SIN_BORDE);

console.log('Rutas que los clientes PIDEN ↔ rutas que el CMS DECLARA');
console.log(`  ${clientes.length} cliente(s) · ${medidas} ruta(s) pedida(s) · ${declaradas.length} declarada(s) (${origen})`);
if (ausentes.length > 0) {
  console.log(`  sin borde: ${ausentes.length} (censadas: ${Object.keys(SIN_BORDE).length})`);
}

if (fallos.length > 0) {
  console.error(`\n✗ ${fallos.length} hallazgo(s):`);
  for (const f of fallos) console.error(`    ${f}`);
  process.exit(1);
}

console.log(`\n✓ ${medidas - ausentes.length} de ${medidas} ligan; ${ausentes.length} censada(s) con su razón.`);
