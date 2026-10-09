/**
 * tools/lib/tinta-de-lavado.mjs
 *
 * Un token de LAVADO no es tinta (UI#91).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Los tokens de estado del CMS vienen en familias: `-text` es la tinta, y `-surface`,
 * `-soft` y `-border` son LAVADOS — un `rgb(… / 0.10)` al 10-16 % (ver `syn-tokens.css`
 * del CMS; `-soft` es un alias de `-surface`). Pintar texto con uno de ellos no es «bajo
 * contraste»: es texto invisible. Medido sobre el CSS del CMS en los siete temas, con el
 * alpha compuesto sobre la tarjeta: el aviso de devolución de storefront —tinta
 * `state-danger-surface` sobre fondo `state-danger-soft`— daba **1,14 a 1,19:1**; el plazo de
 * gov, tinta `state-warning-surface`, **1,13 a 1,33:1**. El ticket lo había medido en 3,43:1
 * porque lo miró en el banco, donde no hay CSS del CMS y manda el respaldo Sass, que es
 * sólido. La misma forma que la regla 3 (`state-brand-surface` en un CTA), con otro estado.
 *
 * Seis usos en tres verticales (storefront, academy, gov). Con la tinta `-text`, de 5,47 a
 * 14,27:1. El árbol ya lo cumple, así que es trinquete absoluto: ningún `color:` nombra un
 * lavado de estado.
 *
 * **Y por un alias tampoco (ADR 0140 F4, CMS#201).** El aviso de rechazo del asistente de la
 * compra —`.syn-wizard__error`, el ÚNICO mensaje de cada rechazo desde la F4— pintaba
 * `color: var(--shw-danger)`, y la hoja definía arriba `--shw-danger:
 * var(--syn-color-state-danger-surface, …)`. Es el mismo texto invisible (medido en el
 * navegador: 1,14 a 1,19:1 en los siete temas, el aviso era una franja rojiza vacía), y este
 * gate no lo veía porque leía sólo la línea del `color:`. Contado con el detector de alias: 31
 * usos por 19 alias en 13 hojas. Se arreglaron los de la compra —asistente, carrito y acuse—
 * con el `-text` de su familia (medido sobre el CSS del CMS en las ocho rutas de render, con el
 * lavado compuesto sobre la tarjeta y sobre el lienzo: peligro 5,04, aviso 4,79 y éxito 5,70
 * como mínimo, contra 1,14 de antes); los demás quedan censados en el spec, y el censo sólo
 * baja.
 *
 * Lo que NO mira, dicho: `fill`/`stroke` de un SVG y `outline-color`. Hoy ninguno nombra un
 * lavado de estado (medido con un grep), y el primero que lo haga es un ícono, no un texto.
 * Tampoco un alias definido en OTRA hoja (un mixin, un `:host` heredado): sólo los de la misma
 * fuente, que es donde vive cada `--shw-*`, `--sct-*` o `--scf-*` del árbol.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un token de estado de la familia del LAVADO. */
const LAVADO = /--syn-color-state-[a-z]+-(?:surface|soft|border)\b/;

/** Quita comentarios de bloque y de línea: la prosa que nombra el defecto es legítima. */
export function sinComentarios(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Las propiedades propias de la hoja que valen un lavado: `Map<alias, token>`.
 *
 * Un alias es una propiedad personalizada cuyo valor nombra un lavado (`--shw-danger:
 * var(--syn-color-state-danger-surface, …)`) o a otro alias de la misma hoja. Basta con que UNA
 * de sus definiciones lo haga: un modificador que lo redefine con un lavado pinta igual.
 *
 * @param {string} fuente un `.scss`, o un `.ts` con estilos en línea
 */
export function aliasDeLavado(fuente) {
  const definiciones = [...sinComentarios(fuente).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)].map((m) => ({
    nombre: m[1],
    valor: m[2],
  }));
  const alias = new Map();
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const { nombre, valor } of definiciones) {
      if (alias.has(nombre)) continue;
      const directo = valor.match(LAVADO);
      const encadenado = directo
        ? null
        : [...valor.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((r) => r[1]).find((r) => alias.has(r));
      if (directo || encadenado) {
        alias.set(nombre, directo ? directo[0] : alias.get(encadenado));
        cambio = true;
      }
    }
  }
  return alias;
}

/**
 * Las declaraciones `color:` que pintan con un lavado: `[{ linea, token, alias? }]`.
 *
 * Sólo la propiedad `color` (la tinta del texto): `background:`, `background-color:` y
 * `border-color:` son justo el sitio de un lavado. `alias` dice por qué propiedad de la hoja
 * llegó, cuando no se nombra el token directo.
 *
 * @param {string} fuente un `.scss`, o un `.ts` con estilos en línea
 */
export function lavadosComoTinta(fuente) {
  const hallados = [];
  const alias = aliasDeLavado(fuente);
  sinComentarios(fuente)
    .split('\n')
    .forEach((linea, i) => {
      for (const m of linea.matchAll(/(?:^|[\s;{'"`])color\s*:\s*([^;'"`}]+)/g)) {
        const token = m[1].match(LAVADO);
        if (token) {
          hallados.push({ linea: i + 1, token: token[0] });
          continue;
        }
        const via = [...m[1].matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((r) => r[1]).find((r) => alias.has(r));
        if (via) hallados.push({ linea: i + 1, token: alias.get(via), alias: via });
      }
    });
  return hallados;
}
