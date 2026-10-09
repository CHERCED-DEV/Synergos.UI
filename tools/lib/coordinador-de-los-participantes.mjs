/**
 * tools/lib/coordinador-de-los-participantes.mjs
 *
 * Todo elemento que participa de un flujo define `<synergos-flujo>` al cargar su bundle, ANTES de
 * registrarse (ADR 0140 F4, decisión 2 · CMS#201).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El coordinador no es un bundle aparte: medido en el plan de la F4, como bundle propio llegaba
 * tarde y el pedido se perdía. Por eso lo define cada participante en su entrada
 * (`definirCoordinador()`, idempotente) antes de registrar su etiqueta, y es la excepción escrita a
 * la obligación 8 de la plataforma. Esa decisión vivía en UNA línea de `eventos/src/main.ts` que
 * ningún test ejecutaba: los specs llaman a `definirCoordinador()` en su propio `beforeAll`, y
 * ninguno carga la entrada. Borrar la línea dejaba `npm test`, G-6, G-7 y `contracts:validate` en
 * verde, y en el bundle publicado cada checkout decía «La compra en línea no está disponible» sin
 * una sola petición (revisión de la F4).
 *
 * Quién participa se DERIVA de `vitals/core/src/flujos`: `pedirAlFlujo` y `hayCoordinador`, y toda
 * función exportada que llame a una de ellas (`abrirCompraDeEventos`, …). Un elemento participa si
 * importa alguna de `@synergos/vitals-core`. Escribirlas a mano dejaría fuera la próxima.
 *
 * Lo que NO mira, dicho: que el bundle publicado la defina de verdad (eso es del navegador) ni
 * una entrada que delegue el arranque en otro módulo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Las funciones con las que un elemento le habla al coordinador, derivadas de las fuentes de los flujos. */
const RAICES = ['pedirAlFlujo', 'hayCoordinador'];

/** Quita comentarios de bloque y de línea. */
export function sinComentarios(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/**
 * Las funciones exportadas de los flujos que hablan con el coordinador: las raíces y toda
 * `export (async) function` cuyo cuerpo llame a una de ellas (hasta un punto fijo).
 *
 * @param {string[]} fuentes los `.ts` de `vitals/core/src/flujos` (sin specs)
 */
export function apiDelParticipante(fuentes) {
  const funciones = [];
  for (const fuente of fuentes.map(sinComentarios)) {
    const cabezas = [...fuente.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)];
    cabezas.forEach((m, i) => {
      funciones.push({ nombre: m[1], cuerpo: fuente.slice(m.index, cabezas[i + 1]?.index ?? fuente.length) });
    });
  }
  const api = new Set(RAICES);
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const { nombre, cuerpo } of funciones) {
      if (api.has(nombre)) continue;
      if ([...api].some((a) => new RegExp(`\\b${a}\\s*[<(]`).test(cuerpo.slice(cuerpo.indexOf('{'))))) {
        api.add(nombre);
        cambio = true;
      }
    }
  }
  return api;
}

/** Lo que un fuente importa de `@synergos/vitals-core`. */
export function importadoDeVitals(fuente) {
  const nombres = new Set();
  for (const m of sinComentarios(fuente).matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@synergos\/vitals-core['"]/g)) {
    for (const parte of m[1].split(',')) {
      const nombre = parte.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (nombre) nombres.add(nombre);
    }
  }
  return nombres;
}

/**
 * Revisa la entrada de un participante: llama `definirCoordinador()` y lo hace ANTES de registrar
 * su elemento. Devuelve `null` si está bien, o la razón.
 *
 * @param {string} entrada el `main.ts` (o lo que declare la plataforma) del elemento
 */
export function revisarEntrada(entrada) {
  const codigo = sinComentarios(entrada);
  const define = codigo.search(/\bdefinirCoordinador\s*\(/);
  const registra = codigo.search(/\bregistrarElemento[A-Za-z]*\s*\(/);
  if (define < 0) return 'su entrada no llama definirCoordinador()';
  if (registra >= 0 && registra < define) return 'su entrada llama definirCoordinador() DESPUÉS de registrar el elemento';
  return null;
}
