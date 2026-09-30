#!/usr/bin/env node
/**
 * Gate: un elemento publicado con gemela en el design system la MONTA, nunca la reimplementa (#81).
 *
 * Es la regla de los dos pisos de la ADR 0134 del CMS. El razonamiento —qué es un par, qué es
 * montar, por qué cierre transitivo y por qué línea base— vive en
 * `tools/lib/gemelas-del-design-system.mjs`, que es lo que `npm test` ejercita sin disco. Acá
 * sólo está el recorrido, y la lectura del design system es la del gate de #78
 * (`leerDesignSystem`), no una segunda.
 *
 * La tabla de pares y la línea base viven en `tools/gemelas-del-design-system.json` y se editan a
 * mano: el diff va en el commit que lo causa —el que monta una pieza baja su entrada de
 * `incumplen`; el que publica un elemento que se llama como una pieza lo clasifica—.
 *
 *   node tools/gemelas-del-design-system.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  leerDesignSystem,
  plataformasConDesignSystem,
  revisarCobertura,
  sinComentariosDeCodigo,
} from './lib/consumidores-del-design-system.mjs';
import { descubrirFuentes, fuenteDeLaEntrada } from './lib/element-sources.mjs';
import {
  aliasDePaths,
  aristasDeMontaje,
  componentesDelArbol,
  evaluarGemelas,
  piezasMontadas,
  raizDelElemento,
} from './lib/gemelas-del-design-system.mjs';
import { loadRegistry } from './lib/synergos-config.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TABLA = join(RAIZ, 'tools', 'gemelas-del-design-system.json');

/** Todo fichero bajo `dir`, recursivo, con ruta absoluta. */
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

function esDirectorio(ruta) {
  try {
    return statSync(ruta).isDirectory();
  } catch {
    return false;
  }
}

/**
 * La tabla de alias que la plataforma declara en su `tsconfig.json`, siguiendo `extends` como
 * el compilador: `paths` y `baseUrl` los pone el más cercano que los declare.
 */
function aliasDeLaPlataforma(base) {
  const cadena = [];
  for (let ruta = join(base, 'tsconfig.json'); ruta && existsSync(ruta) && cadena.length < 10; ) {
    // `tsconfig` admite comentarios: se quitan con el mismo escáner que el resto de los gates.
    const json = JSON.parse(sinComentariosDeCodigo(readFileSync(ruta, 'utf8')));
    cadena.push({ dir: dirname(ruta), opciones: json.compilerOptions ?? {} });
    ruta = typeof json.extends === 'string' ? resolve(dirname(ruta), json.extends) : null;
  }
  const conPaths = cadena.find((c) => c.opciones.paths);
  if (!conPaths) return [];
  const conBaseUrl = cadena.find((c) => c.opciones.baseUrl);
  const contra = conBaseUrl ? resolve(conBaseUrl.dir, conBaseUrl.opciones.baseUrl) : conPaths.dir;
  return aliasDePaths(conPaths.opciones.paths, relative(base, contra));
}

const tabla = JSON.parse(readFileSync(TABLA, 'utf8'));
const registry = loadRegistry();

/** @type {Array<{clase: string, selector: string}>} */
const piezas = [];
/** @type {Map<string, Set<string>|null>} */
const montadas = new Map();
const cobertura = [];
const perdidas = [];

for (const plataforma of plataformasConDesignSystem({ raiz: RAIZ, esDirectorio })) {
  const { framework, base } = plataforma;
  const leido = leerDesignSystem({ base, listar: ficheros, leer: (ruta) => readFileSync(ruta, 'utf8') });
  cobertura.push({ framework, fuentes: leido.fuentesDelDs, componentes: leido.piezas.length });
  // Una plataforma cuyo design system no se sabe leer ya la juzga `revisarCobertura`: o está
  // declarada con su razón, o es un fallo. No hay nada que cruzar en ella.
  if (leido.piezas.length === 0) continue;
  piezas.push(...leido.piezas);

  const { nodos, plantillasPerdidas } = componentesDelArbol(leido.fuentes);
  perdidas.push(...plantillasPerdidas.map((p) => `${framework}: ${p}`));
  const alias = aliasDeLaPlataforma(base);
  const aristas = aristasDeMontaje(nodos, alias);
  const esPieza = (n) => leido.piezas.some((p) => p.clase === n.clase && n.ruta.startsWith(`${p.carpeta}/`));

  // Qué carpeta construye cada entrada del registry: la regla de `element-sources`, no otra.
  const fuentes = descubrirFuentes({
    listar: (dir) => {
      const abs = resolve(RAIZ, dir);
      return esDirectorio(abs)
        ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        : [];
    },
    existe: (ruta) => existsSync(resolve(RAIZ, ruta)),
    plataformas: [plataforma],
  });

  let conRaiz = 0;
  for (const entrada of registry) {
    const fuente = fuenteDeLaEntrada(entrada, fuentes);
    if (!fuente) continue;
    const abs = resolve(RAIZ, fuente.dir, plataforma.entrada);
    const main = { ruta: relative(base, abs).replace(/\\/g, '/'), fuente: readFileSync(abs, 'utf8') };
    const raiz = raizDelElemento(main, nodos, alias);
    montadas.set(entrada.name, raiz?.nodo ? piezasMontadas(raiz.nodo, aristas, esPieza) : null);
    if (raiz?.nodo) conRaiz += 1;
  }

  console.log(
    `[gemelas] ${framework}: ${leido.piezas.length} pieza(s) del design system · ` +
      `${nodos.length} componente(s) en el grafo · ${alias.length} alias · ` +
      `${conRaiz} elemento(s) del registry con raíz`,
  );
}

const r = evaluarGemelas({ tabla, piezas, nombresDelRegistry: registry.map((e) => e.name), montadas });
const fallos = [
  ...revisarCobertura(cobertura).fallos,
  ...perdidas.map(
    (p) => `plantilla que no existe: ${p}. Un componente medido sin su plantilla daría «no monta» por la razón equivocada.`,
  ),
  ...r.fallos,
];

const porNombre = [...r.candidatos.keys()];
const gemelasPorNombre = porNombre.filter((n) => n in (tabla.gemelas ?? {})).length;
const declaradas = Object.keys(tabla.gemelas ?? {}).filter((n) => !r.candidatos.has(n)).length;
console.log(
  `[gemelas] ${porNombre.length} candidato(s) por nombre (${gemelasPorNombre} gemela(s) · ` +
    `${porNombre.length - gemelasPorNombre} no) + ${declaradas} declarada(s) por concepto = ` +
    `${r.pares.length} par(es): ${r.cumplen.length} montan su pieza · ${r.incumplen.length} no`,
);
if (r.incumplen.length > 0) console.log(`[gemelas] no la montan: ${r.incumplen.join(', ')}`);

if (fallos.length > 0) {
  console.error(`\n[gemelas] ✗ ${fallos.length} hallazgo(s):`);
  for (const f of fallos) console.error(`    ${f}`);
  process.exit(1);
}

console.log(
  `\n[gemelas] ✓ ${r.incumplen.length} incumplimiento(s), los mismos de la línea base; ` +
    'ninguno nuevo y ninguno resuelto sin bajarla.',
);
