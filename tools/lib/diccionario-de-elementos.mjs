/**
 * El diccionario de cada elemento: las claves que pide con `t()` contra las que declara su record
 * (ADR 0136 del CMS, piloto CMS#186). Funciones puras: el disco y el contrato se inyectan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE.
 *
 * El CMS publica en cada página la unión de las secciones de diccionario que DECLARAN los
 * records de sus elementos (`[ElementoSynHost(..., Diccionario = [...])]`), y el contrato
 * generado (`elementos-synhost.contract.ts`) trae, por elemento, sus secciones y las claves de
 * uSync que caen en ellas. Una clave que el elemento pide y la página no publica NO FALLA: `t()`
 * devuelve su respaldo, que está escrito en español, y la página se ve traducida. Es la trampa de
 * la regla 44 —«una clave fuera de ellos sale siempre por el respaldo y parece traducida»—, y
 * nada la veía.
 *
 * Lo que se pone rojo, cada cosa por su nombre:
 *   1. una clave que no está en las del contrato del elemento — no existe en uSync, o existe en
 *      una sección que el elemento no declara (ADR 0136 §4, «clave referenciada que no existe»);
 *   2. una clave que no es LITERAL — `t(clave, …)` con una variable se le esconde a este cruce
 *      (regla 37: el helper que recibe el nombre de la clave lo esconde del gate);
 *   3. un `t()` en un elemento SIN contrato — sin record no declara secciones, y su `t()` cae
 *      siempre al respaldo;
 *   4. una sección declarada que el elemento no usa — el bridge la publicaría en cada página donde
 *      esté, para nadie (el defecto de las 176 claves de antes);
 *   5. un `t()` en una LIBRERÍA — las hojas reciben strings (ADR 0136 §2): traduce la
 *      funcionalidad o la pieza colocable que las monta, que es quien declara secciones.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** De dónde se importa el helper (el alias agnóstico; ver la regla 44). */
export const ORIGEN_DE_T = '@synergos/vitals-core';

/** Quita comentarios conservando las líneas (para que el número de línea siga valiendo). */
export function sinComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, antes) => antes + ' '.repeat(m.length - antes.length));
}

/** ¿El fichero importa `t` del bridge? */
export function importaT(src) {
  return new RegExp(`import\\s*\\{[^}]*\\bt\\b[^}]*\\}\\s*from\\s*['"]${ORIGEN_DE_T}['"]`, 's').test(src);
}

/**
 * Las llamadas a `t(` de un fichero que importa el helper: las de clave literal y las que no.
 * No cuenta `algo.t(` ni declaraciones `function t(`.
 *
 * @param {string} src
 * @returns {{ claves: {clave: string, linea: number}[], noLiterales: {texto: string, linea: number}[] }}
 */
export function llamadasDeT(src) {
  const limpio = sinComentarios(src);
  const claves = [];
  const noLiterales = [];
  if (!importaT(limpio)) return { claves, noLiterales };
  const linea = (i) => limpio.slice(0, i).split('\n').length;
  for (const m of limpio.matchAll(/(?<![\w.$])t\(\s*/g)) {
    const desde = m.index + m[0].length;
    const resto = limpio.slice(desde);
    const literal = /^(['"])((?:[^'"\\\n]|\\.)*)\1\s*[,)]/.exec(resto) ?? /^`([^`$]*)`\s*[,)]/.exec(resto);
    if (literal) {
      claves.push({ clave: literal[2] ?? literal[1], linea: linea(m.index) });
    } else {
      noLiterales.push({ texto: resto.split('\n')[0].slice(0, 60), linea: linea(m.index) });
    }
  }
  return { claves, noLiterales };
}

/**
 * ¿`clave` cae en alguna de `secciones`? La regla con la que el CMS publica: la sección ENTERA
 * como prefijo, sin mayúsculas.
 */
export function enAlgunaSeccion(clave, secciones) {
  const k = clave.toLowerCase();
  return secciones.some((s) => {
    const sec = s.toLowerCase();
    return k === sec || k.startsWith(`${sec}.`);
  });
}

/**
 * Los errores de UN elemento.
 *
 * @param {object} args
 * @param {string} args.nombre el `name` del registry.
 * @param {{ diccionario: readonly string[], claves: readonly string[] } | null} args.contrato
 *   lo que dice su contrato, o `null` si no tiene record.
 * @param {{ ruta: string, fuente: string }[]} args.fuentes sus `.ts` (sin specs).
 * @returns {{ errores: string[], usadas: string[] }}
 */
export function revisarElemento({ nombre, contrato, fuentes }) {
  const errores = [];
  const usadas = [];
  for (const { ruta, fuente } of fuentes) {
    const { claves, noLiterales } = llamadasDeT(fuente);
    for (const n of noLiterales) {
      errores.push(`${nombre}: ${ruta}:${n.linea} llama a t() con una clave que no es literal («${n.texto}»): el cruce no la ve. Escribila literal.`);
    }
    if (claves.length === 0) continue;
    if (!contrato) {
      errores.push(`${nombre}: ${ruta} llama a t() y el elemento no tiene record: sin record no declara secciones y la página no publica ninguna clave suya — t() pintaría siempre el respaldo.`);
      continue;
    }
    const permitidas = new Set(contrato.claves.map((c) => c.toLowerCase()));
    for (const { clave, linea } of claves) {
      usadas.push(clave);
      if (permitidas.has(clave.toLowerCase())) continue;
      const enSeccion = enAlgunaSeccion(clave, contrato.diccionario);
      errores.push(
        enSeccion
          ? `${nombre}: ${ruta}:${linea} pide «${clave}», que no existe en uSync (la sección sí está declarada). Proponé la clave en uSync (ADR 0008) o corregí el nombre.`
          : `${nombre}: ${ruta}:${linea} pide «${clave}», que no cae en ninguna sección que declara su record (${contrato.diccionario.join(', ') || 'ninguna'}): la página no la publica y t() pinta siempre el respaldo.`,
      );
    }
  }
  if (contrato) {
    for (const seccion of contrato.diccionario) {
      if (!usadas.some((c) => enAlgunaSeccion(c, [seccion]))) {
        errores.push(`${nombre}: declara la sección «${seccion}» y no pide ninguna clave suya con t(): el bridge la publicaría en cada página donde esté, para nadie. Usala o sacala del record.`);
      }
    }
  }
  return { errores, usadas };
}

/**
 * Las librerías no traducen: las hojas reciben strings (ADR 0136 §2).
 *
 * @param {{ ruta: string, fuente: string }[]} fuentes los `.ts` de las librerías (sin specs).
 * @returns {string[]}
 */
export function revisarLibrerias(fuentes) {
  return fuentes
    .filter(({ fuente }) => importaT(sinComentarios(fuente)))
    .map(({ ruta }) => `${ruta} importa t() del bridge: una librería no declara secciones. Que reciba el texto por input y lo traduzca el elemento que la monta.`);
}
