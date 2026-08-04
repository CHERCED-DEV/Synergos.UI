import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Ataduras de plantilla que parecen correctas y no lo son (issue #11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UN GATE DE REPO Y NO UN TEST POR ELEMENTO.
 *
 * El defecto que lo motivó estaba en CUATRO elementos a la vez, y sólo uno de
 * los cuatro specs lo comprobaba. Los otros tres tenían el caso positivo
 * —«poner un elementId escribe el id»— que **pasa igual con el binding
 * equivocado**, porque poner un id sí funcionaba. Lo que no funcionaba era no
 * ponerlo.
 *
 *   > `[id]` es property binding. La IDL de `id` es `DOMString` sin
 *   > `[LegacyNullToEmptyString]`, así que asignar `null` no quita el atributo:
 *   > lo escribe con la cadena `"null"`. Con dos elementos sin `elementId` en
 *   > la misma página quedan `id` duplicados, y `#null` empieza a resolver a un
 *   > nodo arbitrario.
 *
 * Se arreglaron los cuatro y se les añadió el caso negativo. Pero eso no
 * impide que el patrón vuelva a aparecer en el elemento 140 — y son 139, así
 * que confiar en que alguien se acuerde no es un plan.
 *
 * Un grep sobre las plantillas sí lo impide, y cuesta 20 líneas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const NG = path.join(REPO, 'platforms/angular');

function plantillas(raiz) {
  const encontradas = [];
  if (!existsSync(raiz)) return encontradas;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|dist|\.cdn-out|\.test-out)$/.test(e.name)) continue;
        walk(full);
      } else if (e.name.endsWith('.html')) {
        encontradas.push(full);
      }
    }
  };
  walk(raiz);
  return encontradas;
}

const TODAS = [...plantillas(path.join(NG, 'apps')), ...plantillas(path.join(NG, 'libs'))];

/**
 * Una atadura de PROPIEDAD cuyo valor puede ser `null`.
 *
 * Se busca `|| null` y `?? null` a la derecha de un `[algo]="…"` que NO sea
 * `[attr.…]`, `[class.…]` ni `[style.…]` — esos tres sí quitan lo que atan
 * cuando reciben `null`, que es justo la diferencia.
 */
const PROPIEDAD_CON_NULL =
  /\[(?!attr\.|class\.|style\.)([\w.-]+)\]="[^"]*(?:\|\||\?\?)\s*null\s*"/g;

describe('ataduras de plantilla', () => {
  it('hay plantillas que revisar', () => {
    // Si esto baja de golpe, el gate dejó de mirar donde debía y se quedaría
    // callado para siempre — el modo de fallo más caro de un grep.
    expect(TODAS.length).toBeGreaterThan(100);
  });

  it('ninguna atadura de propiedad puede recibir null: eso escribe la cadena "null"', () => {
    const culpables = [];

    for (const f of TODAS) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(PROPIEDAD_CON_NULL)) {
        culpables.push(`${path.relative(REPO, f)} → ${m[0].trim()}`);
      }
    }

    expect(
      culpables,
      `Usá [attr.${'${prop}'}] en vez de [${'${prop}'}]: con binding de atributo, null SÍ ` +
        `elimina el atributo.\n  ${culpables.join('\n  ')}`,
    ).toEqual([]);
  });
});
