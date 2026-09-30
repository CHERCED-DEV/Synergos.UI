#!/usr/bin/env node
/**
 * Gate: la deuda de piezas del design system que no alcanza ningún elemento no CRECE (#78).
 *
 * El razonamiento, el cierre transitivo y el cruce viven en
 * `tools/lib/consumidores-del-design-system.mjs`, que es lo que `npm test` ejercita sin disco ni
 * red. Acá sólo está el recorrido.
 *
 * **Línea base y no trinquete absoluto**, con el criterio del #140 del hermano: un umbral
 * absoluto sólo vale cuando el árbol YA lo cumple, y éste no —22 de 55—. Un gate siempre rojo
 * deja de leerse (#68, #74).
 *
 *   node tools/consumidores-del-design-system.mjs               # el gate
 *   node tools/consumidores-del-design-system.mjs --actualizar  # baja la línea base
 *
 * El diff de la línea base va en el commit que lo causó, como el de `size:baseline`.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cruzarConLaLineaBase,
  formatearReparto,
  inalcanzablesDesdeProducto,
  leerDesignSystem,
  plataformasConDesignSystem,
  repartoPorTier,
  revisarCobertura,
} from './lib/consumidores-del-design-system.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINEA_BASE = join(RAIZ, 'tools', 'consumidores-del-design-system.baseline.json');
const ACTUALIZAR = process.argv.includes('--actualizar');

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

/** ¿Existe y es una carpeta? Lo que `plataformasConDesignSystem` pregunta al disco. */
function esDirectorio(ruta) {
  try {
    return statSync(ruta).isDirectory();
  } catch {
    return false;
  }
}

let medidos = 0;
let alcanzables = 0;
/** @type {string[]} */
const inalcanzables = [];
/** @type {string[]} */
const sinConsumidorDirecto = [];
/** @type {Array<{framework: string, fuentes: number, componentes: number}>} */
const cobertura = [];

for (const { framework, base } of plataformasConDesignSystem({ raiz: RAIZ, esDirectorio })) {
  const { fuentesDelDs, piezas: componentes, fuentes } = leerDesignSystem({
    base,
    listar: ficheros,
    leer: (ruta) => readFileSync(ruta, 'utf8'),
  });
  cobertura.push({ framework, fuentes: fuentesDelDs, componentes: componentes.length });

  const r = inalcanzablesDesdeProducto(componentes, fuentes);
  medidos += r.medidos;
  alcanzables += r.alcanzables;
  inalcanzables.push(...r.inalcanzables);
  sinConsumidorDirecto.push(...r.sinConsumidorDirecto);

  console.log(
    `[design-system] ${framework}: ${r.medidos} componente(s) · ${r.alcanzables} alcanzable(s) · ` +
      `${r.inalcanzables.length} inalcanzable(s) (${r.sinConsumidorDirecto.length} sin un solo consumidor)`,
  );
  // El reparto por tier se IMPRIME y no se escribe (#172): la guía decía «9 de los 12 patterns»
  // a mano y eran 6. Sin componentes no hay reparto que imprimir — la cobertura lo juzga abajo.
  if (r.medidos > 0) {
    console.log(
      `[design-system] ${framework} por tier, inalcanzables/total: ` +
        formatearReparto(repartoPorTier(componentes, r.inalcanzables)),
    );
  }
}

inalcanzables.sort((a, b) => a.localeCompare(b));

// La cobertura se revisa ANTES de la rama de `--actualizar`: con el recorrido roto, regenerar
// hornearía una lista equivocada en la línea base y el gate quedaría verde sobre ella para
// siempre. `--actualizar` es lo que uno teclea cuando el gate se queja, así que es justo el
// camino por el que entra el error — la lección de la guarda de `contract-keys` del hermano.
const roturas = revisarCobertura(cobertura).fallos;
if (roturas.length > 0) {
  console.error(`\n[design-system] ✗ ${roturas.length} hallazgo(s) de cobertura:`);
  for (const f of roturas) console.error(`    ${f}`);
  process.exit(1);
}

if (ACTUALIZAR) {
  const previa = JSON.parse(readFileSync(LINEA_BASE, 'utf8')).inalcanzables ?? [];
  const crecio = inalcanzables.filter((c) => !previa.includes(c));
  if (crecio.length > 0) {
    // No se bloquea —puede ser legítimo: retirar un consumidor deja muerto a lo que usaba— pero
    // se dice, porque el que teclea `--actualizar` está mirando esta salida y el que revisa el
    // PR sólo ve el diff. Una línea base que crece sin que nadie lo note es una papelera.
    console.warn(
      `\n[design-system] ⚠ la línea base CRECE en ${crecio.length}: ${crecio.join(', ')}.\n` +
        '    Eso es deuda nueva, no un registro. Si de verdad corresponde, la razón va en el ' +
        'commit; si no, decidí qué es antes de subirla.',
    );
  }

  const contenido = {
    medido: new Date().toISOString().slice(0, 10),
    nota:
      'LÍNEA BASE, no objetivo. La deuda de #78: piezas del design system que no alcanza ningún ' +
      'elemento. Se vigila en los dos sentidos — una nueva rompe, y una que dejó de estarlo ' +
      'también, para que el commit que la retira o la cablea baje la línea aquí mismo.',
    inalcanzables,
  };
  writeFileSync(LINEA_BASE, `${JSON.stringify(contenido, null, 2)}\n`, 'utf8');
  console.log(`\n[design-system] línea base reescrita: ${inalcanzables.length} pieza(s).`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(LINEA_BASE, 'utf8'));
const { fallos } = cruzarConLaLineaBase(inalcanzables, base.inalcanzables, medidos);
fallos.push(...revisarCobertura(cobertura).fallos);

if (fallos.length > 0) {
  console.error(`\n[design-system] ✗ ${fallos.length} hallazgo(s):`);
  for (const f of fallos) console.error(`    ${f}`);
  console.error(
    '\n    Qué decidir por cada una, y la razón se escribe. NO se retira por defecto: una pieza ' +
      'sin consumidor es vocabulario del catálogo (regla 40; ADR 0134 del CMS). Las salidas: ' +
      'USAR o MEJORAR (hay una pantalla que debería usarla, y eso es un defecto con su ticket) · ' +
      'FUSIONAR (duplica un concepto que ya existe — búscalo por lo que HACE, no por el nombre) · ' +
      'DECLARAR con su disparador · y RETIRAR sólo con evidencia de que el concepto sobra. El ' +
      'filtro de DECLARAR: la razón tiene que contestar «por qué esto NO se usa», no «por qué ' +
      'todavía no se usó» — lo segundo es un ticket sin abrir disfrazado de excepción.',
  );
  process.exit(1);
}

console.log(
  `\n[design-system] ✓ ${alcanzables} de ${medidos} alcanzables; ${inalcanzables.length} en la ` +
    `línea base de ${base.medido}, sin crecer.`,
);
