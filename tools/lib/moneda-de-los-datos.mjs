/**
 * La moneda sale de los datos, y un importe se pinta en UN solo sitio (CMS#196).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ VIGILA. Dos formas del mismo defecto, las dos medidas en el árbol antes
 * de que existiera esto:
 *
 *  (a) **Una segunda casa del formato.** Cada vertical tenía su `formatPrice`
 *      con `Intl.NumberFormat(… style: 'currency' …)`: diez copias, y lo que
 *      las separaba era justo el defecto (unas pintaban el número solo sin
 *      moneda, otras inventaban un peso). El formato vive en
 *      `vitals/core/src/formato/`; fuera de ahí, `style: 'currency'` es una
 *      copia nueva.
 *  (b) **Una moneda compilada como respaldo.** `currency || 'COP'`,
 *      `?? 'COP'`, `const DEFAULT_CURRENCY = 'COP'`, `currency = 'COP'` en una
 *      firma o un `'COP'` pasado como argumento de respaldo: la moneda del
 *      sitio escrita en el bundle, una segunda fuente para un dato que llega
 *      CON cada importe desde la API (ADR 0137, cambio 4). Sin moneda se pinta
 *      el número solo.
 *
 * LOS CÓDIGOS SALEN DE `Intl`, no de una lista: `Intl.supportedValuesOf` da
 * los ISO-4217 que el motor conoce, así que `?? 'USD'` cae igual que
 * `?? 'COP'` y `?? 'GET'` no (no es una moneda).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** VE, para que nadie deje de mirar confiando en esto:
 *
 *  (1) **Un literal de datos.** `{ price: 480_000, currency: 'COP' }` en una
 *      muestra es un importe escrito en pesos y está bien; sintácticamente es
 *      lo mismo que `CLEAN_PRICING = { currency: 'COP' }`, que no lo estaba.
 *      Distinguirlos pide saber qué es muestra y qué es respaldo, y un regex no
 *      lo sabe: el gate mira las formas de RESPALDO, no las propiedades.
 *  (2) **Una copia del formato sin `style: 'currency'`**: un
 *      `` `$ ${n.toLocaleString()}` `` pasa. Es la forma que no ha ocurrido.
 *  (3) **Los specs**: un spec escribe monedas para fijar lo que se pinta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ficherosTs } from './normalizador-unico.mjs';
import { sinComentarios } from './vitals-purity.mjs';

/** Dónde vive el formato de importes. Todo lo demás es «fuera». */
export const CASA = path.join('vitals', 'core', 'src', 'formato');

/** Lo que se recorre: el código del producto. `tools/` es tooling, y este gate se nombraría a sí mismo. */
export const RAICES = ['vitals', 'platforms'];

/**
 * Un formateador GENÉRICO que no es una copia del formato del producto: `NumberFormatService` de
 * `@synergos/core` formatea cualquier número con cualquier opción de `Intl` (y redondeo), y la
 * moneda la RECIBE, no la decide. Va por el NOMBRE de la clase y no por su ruta (el gate no cablea
 * una plataforma), y el spec exige que siga existiendo: una excepción que nadie declara se pudre.
 */
export const GENERICOS = ['NumberFormatService'];

/** Si el fuente declara uno de los formateadores genéricos. */
export function declaraGenerico(src) {
  return GENERICOS.some((nombre) => new RegExp(String.raw`\bexport\s+class\s+${nombre}\b`).test(src));
}

/** Los ISO-4217 que conoce el motor: la lista se deriva, no se escribe. */
export const MONEDAS = new Set(Intl.supportedValuesOf('currency'));

const ES_SPEC = /\.spec\.[cm]?[jt]sx?$/;

const FORMATO = /style\s*:\s*['"]currency['"]/;

/** Un literal entre comillas que es una moneda: devuelve el código o null. */
function moneda(literal) {
  const codigo = literal.slice(1, -1);
  return MONEDAS.has(codigo) ? codigo : null;
}

/** Las formas de RESPALDO: lo que se pone cuando el dato no trajo moneda. */
const RESPALDOS = [
  // currency || 'COP'   ·   currency ?? 'COP'
  /(?:\|\||\?\?)\s*('[A-Z]{3}'|"[A-Z]{3}")/g,
  // const DEFAULT_CURRENCY = 'COP'   ·   currency = 'COP' (parámetro por defecto)
  /\b\w*(?:currency|Currency|CURRENCY|moneda|Moneda|MONEDA)\w*\s*(?::\s*\w+\s*)?=\s*('[A-Z]{3}'|"[A-Z]{3}")/g,
  // normalizeX(entry, 'COP')   ·   readString(data, 'currency', 'COP')
  /,\s*('[A-Z]{3}'|"[A-Z]{3}")\s*\)/g,
];

/**
 * Lo que un fuente hace mal: `{ linea, regla, texto }`. Se lee SIN COMENTARIOS:
 * la cabecera de la casa explica `currency || 'COP'` y no es código.
 */
export function hallazgos(src) {
  const salida = [];
  const lineas = sinComentarios(src).split('\n');
  lineas.forEach((linea, i) => {
    if (FORMATO.test(linea)) {
      salida.push({ linea: i + 1, regla: 'formato', texto: linea.trim() });
    }
    const respaldo = RESPALDOS.some((patron) => [...linea.matchAll(patron)].some((m) => moneda(m[1])));
    if (respaldo) {
      salida.push({ linea: i + 1, regla: 'respaldo', texto: linea.trim() });
    }
  });
  return salida;
}

/** Todos los hallazgos del repo, fuera de la casa y de los specs. */
export function monedasFueraDeLosDatos(repo) {
  const casaAbs = path.join(repo, CASA);
  const salida = [];
  for (const raiz of RAICES) {
    for (const abs of ficherosTs(path.join(repo, raiz))) {
      if (abs === casaAbs || abs.startsWith(casaAbs + path.sep) || ES_SPEC.test(abs)) continue;
      const src = readFileSync(abs, 'utf8');
      const generico = declaraGenerico(src);
      for (const h of hallazgos(src)) {
        if (h.regla === 'formato' && generico) continue;
        salida.push({ fichero: path.relative(repo, abs), ...h });
      }
    }
  }
  return salida.sort((a, b) => a.fichero.localeCompare(b.fichero) || a.linea - b.linea);
}
