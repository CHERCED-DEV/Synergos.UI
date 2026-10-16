/**
 * tools/lib/envoltorios-de-los-flujos.mjs
 *
 * Gana el generado (núcleo N3, FR-030 · SC-006): el transporte de un flujo sale de su envoltorio
 * generado en `vitals/core/src/flujos/generados/`, y no de uno escrito a mano.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes de N3 cada vertical escribía el suyo —`eventos-compra.ts`: la clave del flujo y una función
 * por operación sobre `pedirAlFlujo`—, y era la pieza que un flujo nuevo copiaba. Desde N3 lo emite
 * `contrato-http.mjs` del mismo documento que los tipos. Lo que esto vigila es que siga así:
 *
 *   1. Todo flujo que la puerta expone tiene su envoltorio generado.
 *   2. Fuera de lo generado nadie llama a `pedirAlFlujo` (salvo `coordinador.ts`, que lo define): un
 *      elemento o un fichero del núcleo que lo llame es un envoltorio a mano con otra cara.
 *   3. En el núcleo, sólo los envoltorios a mano DECLARADOS envuelven a uno generado
 *      (`ENVOLTORIOS_A_MANO`): son piezas del superset, que conservan su API para quien ya las usa y
 *      se apoyan en el generado. Uno nuevo es rojo.
 *
 * Lo que NO mira, dicho: un elemento que llame a una función generada lo está haciendo bien (es
 * para eso), y la lectura de la respuesta (`leerCompra`) es del vertical, no de transporte.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { sinComentarios } from './coordinador-de-los-participantes.mjs';

/**
 * Los envoltorios escritos a mano de antes de N3, por fichero de `vitals/core/src/flujos`: piezas del
 * superset, declaradas. No se borran (CLAUDE.md, superset); se apoyan en el generado.
 */
export const ENVOLTORIOS_A_MANO = Object.freeze({ 'eventos-compra.ts': 'eventos.compra' });

/** El fichero que DEFINE `pedirAlFlujo`: es el único del núcleo que lo nombra sin ser generado. */
const DEFINE_PEDIR = 'coordinador.ts';

/**
 * Los flujos que la puerta expone, leídos de la tabla de ejecución de un contrato generado
 * (`vitals/contracts/src/http/bff-*.contract.ts`): sus claves de primer nivel.
 *
 * @param {string} fuente el contrato generado de un orquestador.
 * @returns {string[]}
 */
export function flujosDeLaTabla(fuente) {
  const inicio = fuente.indexOf('export const OPERACIONES_DE_LA_PUERTA = {');
  if (inicio < 0) return [];
  const tabla = fuente.slice(inicio, fuente.indexOf('} as const satisfies', inicio));
  return [...tabla.matchAll(/^ {2}"([a-z0-9.-]+)": \{$/gm)].map((m) => m[1]);
}

/**
 * Lo que rompe la regla, una línea por defecto; vacío si se cumple.
 *
 * @param {object} p
 * @param {readonly string[]} p.flujos las claves que la puerta expone.
 * @param {ReadonlyMap<string, string>} p.generados fichero → fuente de `generados/`.
 * @param {ReadonlyMap<string, string>} p.nucleo fichero → fuente de los `.ts` de `vitals/core/src/flujos`
 *   que no son generados ni specs.
 * @param {ReadonlyMap<string, string>} p.resto ruta → fuente del resto del front (sin specs).
 * @param {Readonly<Record<string, string>>} [p.declarados] los envoltorios a mano declarados.
 * @returns {string[]}
 */
export function revisarEnvoltorios({ flujos, generados, nucleo, resto, declarados = ENVOLTORIOS_A_MANO }) {
  const errores = [];

  for (const flujo of flujos) {
    if (!generados.has(`${flujo}.ts`)) {
      errores.push(`«${flujo}» lo expone la puerta y no tiene envoltorio generado (generados/${flujo}.ts): regenerar con contrato-http`);
    }
  }

  for (const [fichero, fuente] of [...nucleo, ...resto]) {
    if (fichero === DEFINE_PEDIR) continue;
    if (/\bpedirAlFlujo\s*[<(]/.test(sinComentarios(fuente))) {
      errores.push(`${fichero} llama a pedirAlFlujo: el transporte de un flujo sale de su envoltorio generado`);
    }
  }

  const funcionesGeneradas = [...generados.values()].flatMap((f) => [...f.matchAll(/^export function (\w+)\(/gm)].map((m) => m[1]));
  for (const [fichero, fuente] of nucleo) {
    const codigo = sinComentarios(fuente);
    const usa = funcionesGeneradas.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(codigo));
    if (usa.length > 0 && !Object.prototype.hasOwnProperty.call(declarados, fichero)) {
      errores.push(
        `${fichero} envuelve a mano a uno generado (${usa.join(', ')}): un flujo nuevo usa el generado, sin escribir otro`,
      );
    }
  }

  for (const [fichero, flujo] of Object.entries(declarados)) {
    if (!nucleo.has(fichero)) {
      errores.push(`${fichero} está declarado como envoltorio a mano de «${flujo}» y no existe: sale de ENVOLTORIOS_A_MANO`);
    } else if (!generados.has(`${flujo}.ts`)) {
      errores.push(`${fichero} envuelve «${flujo}», que no tiene envoltorio generado en el que apoyarse`);
    }
  }

  return errores;
}
