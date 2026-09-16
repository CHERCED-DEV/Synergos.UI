/**
 * Un solo normalizador de lo que emite el CMS (#63).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ VIGILA, Y POR QUÉ VA POR EL NOMBRE DE LA FUNCIÓN.
 *
 * `vitals/core/src/inputs/` es el sitio donde vive la conversión de «JSON sin
 * tipo que escribió un editor» a «config tipado». Bajó ahí al segundo
 * consumidor —la segunda plataforma— y lo que la mudanza compra es que **haya
 * uno solo**: dos normalizadores que se separan es cómo una clave del CMS deja
 * de cruzar en silencio, sin error y sin log.
 *
 * Un gate por RUTA DE FICHERO no sirve y hay que decirlo, porque es el que uno
 * escribe primero: la séptima copia no se va a llamar `config-input.util.ts`.
 * Se va a llamar `parseConfig` dentro del componente que la necesitó, o
 * `coerceTrimmedStringInput` otra vez en el `shared` del framework nuevo — y
 * las dos cosas pasan un gate por ruta. Lo único LITERAL es el identificador,
 * que es la lección de `feedback_the_same_algorithm_is_not_the_same_thing` del
 * repo hermano: el `grep` va por el alias, no por el nombre de la función que
 * cada copia elige.
 *
 * LA LISTA SE DERIVA DEL DISCO. No hay un array de nombres acá: se leen los
 * `export` de `vitals/core/src/inputs/*.util.ts`. Añadir una función al
 * normalizador la pone bajo vigilancia sin tocar este fichero, y quitarla la
 * saca — que es lo que impide que esto envejezca.
 *
 * RED DE SEGURIDAD: si el descubrimiento deja de ver los nombres, la lista sale
 * vacía y el cruce pasaría en verde **sin mirar nada**. Por eso
 * `nombresNormalizadores` se comprueba contra un piso y el spec lo exige: un
 * gate que se queda ciego tiene que ponerse rojo, no callarse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** VE, para que nadie deje de mirar confiando en esto:
 *
 *  (a) **Un método de clase.** `avatar.initials` hace lo mismo que `monogram`
 *      y este gate no lo caza: detectar `initials(` dentro de un `class` da
 *      falsos positivos con cualquier método homónimo. `FRONTERA_VITALS.md` §5
 *      lo tiene medido y marcado como «posible gemelo» — eso es trabajo del
 *      grupo C, no de un regex.
 *  (b) **Una copia con otro nombre.** `parseConfig` que haga exactamente lo que
 *      `coerceConfigInput` es una copia y acá pasa. Lo que el gate impide es la
 *      forma que de verdad ocurre —copiar el fichero, conservando los nombres,
 *      porque los llamadores ya los usan—, no el plagio con renombrado.
 *  (c) **El SCSS y los `.mjs`.** Sólo se leen `.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sinComentarios } from './vitals-purity.mjs';

/** Dónde vive el normalizador. Todo lo demás es «fuera». */
export const CASA = path.join('vitals', 'core', 'src', 'inputs');

/**
 * Carpetas que no se recorren: ni son fuente del repo ni las escribe nadie.
 *
 * Las ocultas se descartan POR SU FORMA y no por su nombre. La primera versión
 * enumeraba `.git`, `.claude`, `.test-out` y `.angular`, y el censo de #60 la
 * rechazó con razón: nombrar `.angular` en una herramienta neutral es cablear
 * un framework, y el día que exista una segunda plataforma su caché se llamaría
 * `.next` o `.svelte-kit` y este barrido entraría a leerla sin que nada avisara
 * — la regla 25 con la constante escondida en una lista de exclusiones.
 */
const NO_SE_RECORRE = new Set(['node_modules', 'dist', 'public', 'coverage']);

/** Una carpeta oculta nunca es fuente de este repo. */
function seSalta(entrada) {
  return entrada.startsWith('.') || NO_SE_RECORRE.has(entrada);
}

/** Todos los `.ts` del repo, sin lo que no es fuente. */
export function ficherosTs(repo) {
  const salida = [];
  const pendientes = [repo];
  while (pendientes.length > 0) {
    const dir = pendientes.pop();
    let entradas;
    try { entradas = readdirSync(dir); } catch { continue; }
    for (const entrada of entradas) {
      if (seSalta(entrada)) continue;
      const abs = path.join(dir, entrada);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) { pendientes.push(abs); continue; }
      if (abs.endsWith('.ts')) salida.push(abs);
    }
  }
  return salida.sort();
}

/**
 * Las declaraciones de ámbito de módulo de un fuente: `{ nombre, linea }`.
 *
 * Se lee SIN COMENTARIOS. Sin eso, la cabecera de `inputs/index.ts` —que nombra
 * `coerceTrimmedStringInput` para explicar qué hay ahí— contaría como una
 * declaración: el gate se engañaría con su propia explicación, que es el
 * tropiezo que este repo ya documentó en el gate del import map (#126).
 */
export function declaraciones(src) {
  const limpio = sinComentarios(src);
  const salida = [];
  const lineas = limpio.split('\n');
  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i];
    const fn = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/.exec(linea);
    if (fn) { salida.push({ nombre: fn[1], linea: i + 1 }); continue; }
    const asignada = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/.exec(linea);
    if (asignada) salida.push({ nombre: asignada[1], linea: i + 1 });
  }
  return salida;
}

/** Los nombres que `vitals/core/src/inputs/` EXPORTA, leídos del disco. */
export function nombresNormalizadores(repo) {
  const casa = path.join(repo, CASA);
  const nombres = new Set();
  let entradas;
  try { entradas = readdirSync(casa); } catch { return nombres; }
  for (const entrada of entradas) {
    if (!entrada.endsWith('.ts') || entrada.endsWith('.spec.ts') || entrada === 'index.ts') continue;
    const src = sinComentarios(readFileSync(path.join(casa, entrada), 'utf8'));
    for (const linea of src.split('\n')) {
      const m = /^\s*export\s+(?:async\s+)?(?:function\s*\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(linea);
      if (m) nombres.add(m[1]);
    }
  }
  return nombres;
}

/**
 * Las segundas declaraciones: `{ fichero, linea, nombre }` por cada nombre del
 * normalizador declarado fuera de su casa.
 */
export function segundasDeclaraciones(repo) {
  const nombres = nombresNormalizadores(repo);
  const casaAbs = path.join(repo, CASA);
  const salida = [];
  for (const abs of ficherosTs(repo)) {
    if (abs === casaAbs || abs.startsWith(casaAbs + path.sep)) continue;
    const src = readFileSync(abs, 'utf8');
    for (const decl of declaraciones(src)) {
      if (!nombres.has(decl.nombre)) continue;
      salida.push({ fichero: path.relative(repo, abs), linea: decl.linea, nombre: decl.nombre });
    }
  }
  return salida.sort((a, b) => a.fichero.localeCompare(b.fichero) || a.linea - b.linea);
}
