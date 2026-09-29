/**
 * Los tramos de `npm test`, y cómo se agregan (#79).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA, MEDIDO.
 *
 * `npm test` era `test:contratos && test:tools && test:vitals && test:angular && test:preact`.
 * Con `&&`, el PRIMER rojo es el ÚNICO rojo: en Windows `test:tools` daba 4 rojos de separador
 * de rutas —del spec, no del producto— y eso dejaba sin correr `test:vitals`, `test:angular` y
 * `test:preact`, **1.601 tests** de los que nadie sabía nada. Un rojo que esconde a los
 * siguientes no dice «hay un fallo»: dice «no sé cuántos hay».
 *
 * Aquí se corren TODOS, se imprime el resultado de cada uno, y se sale 1 si alguno falló.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LISTA SE DERIVA, NO SE ESCRIBE.
 *
 * Un tramo es un script `test:*` del `package.json` de la raíz, en el orden en que está
 * declarado. Escribir la lista en este fichero sería la regla 25 otra vez —una dimensión de lo
 * que se recorre resuelta a constante—: el día que alguien añada `test:<algo>` al `package.json`
 * tendría que acordarse de venir aquí, y el que se olvide deja un tramo que nadie corre.
 *
 * Puro: el disco y el proceso se inyectan, para poder ver fallar la agregación sin lanzar nada.
 */

/** Lo que hace que un script sea un tramo de `npm test`. */
export const PREFIJO_DE_TRAMO = 'test:';

/**
 * Los tramos, en el orden del `package.json`. Las claves de comentario (`// test:…`) no cuentan:
 * no empiezan por el prefijo.
 *
 * @param {Record<string, string> | undefined} scripts
 * @returns {string[]}
 */
export function tramosDeTest(scripts) {
  return Object.keys(scripts ?? {}).filter((k) => k.startsWith(PREFIJO_DE_TRAMO));
}

/**
 * Los que se van a correr: todos, o los que nombre `--solo=a,b` —en el orden DECLARADO, no en el
 * pedido—. Un nombre que no es un tramo es un error y no se ignora: un `--solo` mal escrito que
 * corriera cero tramos saldría 0, y un CI lo leería como verde.
 *
 * @param {string[]} tramos
 * @param {string | null} [solo]
 * @returns {string[]}
 */
export function elegirTramos(tramos, solo = null) {
  if (tramos.length === 0) {
    throw new Error(`el package.json no declara ningún script \`${PREFIJO_DE_TRAMO}*\`: no hay nada que correr.`);
  }
  if (solo === null || solo === undefined) return [...tramos];

  const pedidos = String(solo).split(',').map((s) => s.trim()).filter(Boolean);
  if (pedidos.length === 0) throw new Error('`--solo` vacío: nombrá al menos un tramo.');
  const desconocidos = pedidos.filter((p) => !tramos.includes(p));
  if (desconocidos.length > 0) {
    throw new Error(`\`--solo\` nombra lo que no es un tramo: ${desconocidos.join(', ')}. Los tramos son: ${tramos.join(', ')}.`);
  }
  return tramos.filter((t) => pedidos.includes(t));
}

/**
 * Corre CADA tramo, falle o no el anterior.
 *
 * @param {string[]} tramos
 * @param {(tramo: string) => number} ejecutar Devuelve el código de salida del tramo.
 * @param {() => number} [reloj] Milisegundos; se inyecta para el spec.
 * @returns {{ tramo: string, codigo: number, ms: number }[]}
 */
export function correrTramos(tramos, ejecutar, reloj = () => Date.now()) {
  const resultados = [];
  for (const tramo of tramos) {
    const inicio = reloj();
    let codigo;
    try {
      codigo = ejecutar(tramo);
    } catch {
      codigo = 1;
    }
    resultados.push({ tramo, codigo: Number.isInteger(codigo) ? codigo : 1, ms: reloj() - inicio });
  }
  return resultados;
}

/**
 * El resumen que se imprime al final, y el código con el que sale `npm test`. Sin resultados es
 * un FALLO: cero tramos corridos no es «todo verde».
 *
 * @param {{ tramo: string, codigo: number, ms: number }[]} resultados
 * @returns {{ lineas: string[], codigo: 0 | 1 }}
 */
export function resumen(resultados) {
  if (resultados.length === 0) {
    return { lineas: ['[npm test] ✗ no corrió ningún tramo.'], codigo: 1 };
  }
  const ancho = Math.max(...resultados.map((r) => r.tramo.length));
  const segundos = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const lineas = ['', '[npm test] resumen'];
  for (const r of resultados) {
    const marca = r.codigo === 0 ? '✓' : '✗';
    const detalle = r.codigo === 0 ? '' : `  (salió ${r.codigo})`;
    lineas.push(`  ${marca} ${r.tramo.padEnd(ancho)}  ${segundos(r.ms)}${detalle}`);
  }
  const rojos = resultados.filter((r) => r.codigo !== 0);
  lineas.push(
    rojos.length === 0
      ? `[npm test] ✓ ${resultados.length} de ${resultados.length} tramos en verde.`
      : `[npm test] ✗ ${rojos.length} de ${resultados.length} tramos en rojo: ${rojos.map((r) => r.tramo).join(', ')}.`,
  );
  return { lineas, codigo: rojos.length === 0 ? 0 : 1 };
}
