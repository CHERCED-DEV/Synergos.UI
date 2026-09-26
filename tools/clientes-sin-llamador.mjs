#!/usr/bin/env node
/**
 * Gate: todo método público de un `*-api.client.ts` tiene quien lo llame (#76).
 *
 * El razonamiento, el censo y el cruce viven en `tools/lib/clientes-sin-llamador.mjs`, que es
 * lo que `npm test` ejercita sin disco ni red. Acá sólo está el recorrido.
 *
 * **Trinquete absoluto y no línea base**, con el criterio del #134 del repo hermano: un umbral
 * absoluto sólo vale cuando el árbol YA lo cumple. Medido al escribirlo — un solo método
 * censado, con su razón. Con deuda declarada iría una línea base.
 *
 * Uso: node tools/clientes-sin-llamador.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATAFORMAS } from './lib/element-sources.mjs';
import { SIN_LLAMADOR, SUFIJO_CLIENTE, cruzarLlamadores } from './lib/clientes-sin-llamador.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Todo fichero bajo `dir`, recursivo. */
function ficheros(dir) {
  /** @type {string[]} */
  const salida = [];
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
      salida.push(...ficheros(ruta));
    } else if (e.isFile()) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Los clientes y, por cada uno, sus posibles llamadores.
 *
 * La carpeta de apps se toma de `PLATAFORMAS`, derivada de `PLATFORMS`: escribir
 * `platforms/angular` a mano acá resolvería a un literal una dimensión de lo que se recorre
 * —la regla 25— y además lo prohíbe el censo de `frameworks.spec.mjs`.
 *
 * **Un llamador tiene que IMPORTAR el cliente**, y el vecindario es el del propio vertical:
 * buscar por todo el árbol mediría «alguien nombra este método» en vez de «alguien llama a
 * ESTE». Los specs quedan fuera a propósito — ver el `<remarks>` de la lib.
 */
function descubrir() {
  const clientes = [];

  for (const plataforma of PLATAFORMAS) {
    const apps = join(RAIZ, plataforma.apps);
    try {
      if (!statSync(apps).isDirectory()) continue;
    } catch {
      continue;
    }

    for (const ruta of ficheros(apps)) {
      if (!ruta.endsWith(SUFIJO_CLIENTE)) continue;

      const carpeta = dirname(ruta);
      const modulo = ruta.slice(0, -'.ts'.length);
      const vertical = ruta.slice(0, -SUFIJO_CLIENTE.length).split(/[\\/]/).pop();

      const vecinos = ficheros(carpeta)
        .filter((v) => v !== ruta && /\.tsx?$/.test(v) && !v.endsWith('.spec.ts') && !v.endsWith('.spec.tsx'))
        .map((v) => ({ ruta: v, fuente: readFileSync(v, 'utf8') }))
        // Sólo quien importa el cliente. El import es relativo, así que basta el basename del
        // módulo — `from './blogs-api.client'`.
        .filter((v) => v.fuente.includes(`${modulo.split(/[\\/]/).pop()}'`) || v.fuente.includes(`${modulo.split(/[\\/]/).pop()}"`));

      clientes.push({ vertical, cliente: ruta, fuente: readFileSync(ruta, 'utf8'), vecinos });
    }
  }

  return clientes;
}

const clientes = descubrir();
const { fallos, medidos, sinLlamador } = cruzarLlamadores(clientes, SIN_LLAMADOR);

console.log('Métodos públicos de los clientes HTTP ↔ sus llamadores');
console.log(`  ${clientes.length} cliente(s) · ${medidos} método(s) público(s) medido(s)`);
if (sinLlamador.length > 0) {
  console.log(`  sin llamador: ${sinLlamador.join(', ')} (censados: ${Object.keys(SIN_LLAMADOR).length})`);
}

if (fallos.length > 0) {
  console.error(`\n✗ ${fallos.length} hallazgo(s):`);
  for (const f of fallos) console.error(`    ${f}`);
  process.exit(1);
}

console.log(`\n✓ ${medidos - sinLlamador.length} de ${medidos} tienen llamador; ${sinLlamador.length} censado(s) con su razón.`);
