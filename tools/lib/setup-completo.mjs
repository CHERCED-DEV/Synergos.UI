/**
 * Qué hace falta instalar en un clon limpio — y que nadie lo escriba a mano (#70).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA, MEDIDO.
 *
 * Clonado en limpio el 2026-09-16:
 *
 *     npm ci    → OK, 193 paquetes
 *     npm test  → Error: Cannot find module 'sass'
 *                   at platforms/angular/tools/ngtsc.mjs:38
 *
 * `npm ci` en la raíz **no instala las plataformas**: no hay `workspaces`, y
 * `platforms/angular` y `platforms/preact` tienen cada uno su `package.json` y
 * su `package-lock.json`. Hacen falta TRES instalaciones y la raíz hace una.
 *
 * Y el script que existía para eso decía
 *
 *     "setup": "npm install && npm install --prefix platforms/angular"
 *
 * o sea: **una lista de plataformas escrita a mano**, que olvidó `preact` el día
 * que #64 la creó. Es la regla 25 en el camino de entrada — una dimensión de lo
 * que se mide resuelta a constante— y el repo ya tenía la lista derivada del
 * disco (`frameworksConstruibles`) sin que nadie la usara acá.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO LO VIO NINGÚN TEST.
 *
 * Porque **ningún test mide el camino de entrada**: todos corren dentro de un
 * árbol que ya tiene las tres instalaciones hechas, así que la pregunta «¿qué
 * necesita un clon limpio?» no se le hace a nadie. Es la regla 11 del revés —
 * allí el error fue afirmar sin comprobar que algo NO se podía hacer; acá es dar
 * por hecho que algo funciona sin haberlo hecho nunca desde cero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE MÓDULO NO HACE, Y VA DICHO.
 *
 * No comprueba que lo instalado sea lo CORRECTO —eso lo dice `npm ci` contra el
 * lock—, sólo que cada sitio que tiene su propio `package.json` tenga también su
 * `node_modules`. Es una comprobación de presencia, y existe para cambiar un
 * `MODULE_NOT_FOUND` con traza de `ngtsc` por una línea que dice qué teclear.
 */

/** La raíz cuenta como un sitio a instalar, igual que cada plataforma. */
export const RAIZ = '.';

/**
 * Los sitios que hay que instalar: la raíz más cada plataforma construible.
 *
 * El disco se **inyecta**, como en `frameworks.mjs`, para poder ver fallar el
 * gate sin montar un árbol de mentira.
 *
 * @param {{ raiz: string, listarDirs: (d: string) => string[],
 *           existe: (r: string) => boolean, unir: (...p: string[]) => string }} io
 * @param {(io: any) => string[]} construibles Normalmente `frameworksConstruibles`.
 * @returns {{ etiqueta: string, prefijo: string | null }[]}
 */
export function sitiosAInstalar(io, construibles) {
  return [
    { etiqueta: 'raíz', prefijo: null },
    ...construibles(io).map((f) => ({ etiqueta: f, prefijo: `${io.carpetaPlataformas}/${f}` })),
  ];
}

/**
 * Cuáles de esos sitios NO tienen sus dependencias puestas.
 *
 * @param {{ etiqueta: string, prefijo: string | null }[]} sitios
 * @param {{ raiz: string, existe: (r: string) => boolean, unir: (...p: string[]) => string }} io
 * @returns {string[]} Las etiquetas de los que faltan, en orden.
 */
export function sitiosSinInstalar(sitios, io) {
  return sitios
    .filter(({ prefijo }) => {
      const base = prefijo === null ? io.raiz : io.unir(io.raiz, prefijo);
      return !io.existe(io.unir(base, 'node_modules'));
    })
    .map((s) => s.etiqueta);
}

/**
 * El `setup` no puede nombrar una plataforma a mano.
 *
 * <p>Se lee la fuente SIN comentarios —si no, el gate mide la prosa que explica
 * el defecto, que es lo que `feedback_a_gate_that_parses_source_needs_its_own_mutations`
 * documenta— y se rechaza cualquier mención literal de `platforms/<algo>`.</p>
 *
 * @param {string} fuente El contenido de `tools/setup.mjs` (o del script del package.json).
 * @param {string} carpetaPlataformas Normalmente `platforms`.
 * @returns {string[]} Las plataformas nombradas a mano, si las hay.
 */
export function plataformasCableadas(fuente, carpetaPlataformas) {
  const sinBloque = fuente.replace(/\/\*[\s\S]*?\*\//g, '');
  const sinLinea = sinBloque.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const re = new RegExp(`${carpetaPlataformas}/([A-Za-z0-9_-]+)`, 'g');
  return [...new Set([...sinLinea.matchAll(re)].map((m) => m[1]))].sort();
}
