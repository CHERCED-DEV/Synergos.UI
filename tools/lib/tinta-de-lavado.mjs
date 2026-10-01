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
 * Lo que NO mira, dicho: `fill`/`stroke` de un SVG y `outline-color`. Hoy ninguno nombra un
 * lavado de estado (medido con un grep), y el primero que lo haga es un ícono, no un texto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un token de estado de la familia del LAVADO. */
const LAVADO = /--syn-color-state-[a-z]+-(?:surface|soft|border)\b/;

/** Quita comentarios de bloque y de línea: la prosa que nombra el defecto es legítima. */
export function sinComentarios(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Las declaraciones `color:` que pintan con un lavado: `[{ linea, token }]`.
 *
 * Sólo la propiedad `color` (la tinta del texto): `background:`, `background-color:` y
 * `border-color:` son justo el sitio de un lavado.
 *
 * @param {string} fuente un `.scss`, o un `.ts` con estilos en línea
 */
export function lavadosComoTinta(fuente) {
  const hallados = [];
  sinComentarios(fuente)
    .split('\n')
    .forEach((linea, i) => {
      for (const m of linea.matchAll(/(?:^|[\s;{'"`])color\s*:\s*([^;'"`}]+)/g)) {
        const token = m[1].match(LAVADO);
        if (token) hallados.push({ linea: i + 1, token: token[0] });
      }
    });
  return hallados;
}
