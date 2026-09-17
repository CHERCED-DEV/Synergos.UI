import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { raicesEnDisco } from './frameworks.mjs';


/**
 * Shells del catálogo que nadie monta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA.
 *
 * El catálogo de `@synergos/shells` es la respuesta del repo a «no escribamos
 * nueve veces lo mismo», y funciona: las nueve apps componen sobre él. Pero
 * **nada miraba quién consume qué**, y eso se nota:
 *
 *  - ~~`booking-wizard` no montaba NI UNO~~ — **recompuesto** (#24): hoy monta
 *    SH-3 y SH-11, y su lógica de hotel vive en una `IFulfillmentStrategy`. Se
 *    deja escrito porque es el caso que mejor mostró para qué sirve mirar esto:
 *    era el patrón puro escrito a mano, y la recomposición destapó que apartar y
 *    cobrar fallaban con el mismo mensaje.
 *  - ~~`blogs` no montaba SH-6 teniendo una vista `write`~~ — **recompuesto**
 *    (#26), y ahí estaba lo caro: el editor no persistía nada y publicar BORRABA
 *    el texto por un camino que nunca fallaba.
 *  - ~~`travel-shell` tiene tres buscadores y no monta SH-1~~ — **montado** (#27),
 *    y fue el hallazgo más caro de los tres: mirar POR QUÉ no lo montaba destapó
 *    que el auto era inalcanzable —buscar uno caía en la vista de vuelos y
 *    `addCarToCart` no tenía un solo llamador— con el spec afirmándolo.
 *
 * Los tres estaban, los tres se cerraron, y ninguno era «sólo» una pieza sin
 * montar: los tres escondían un defecto detrás. Una pieza que nadie monta es una
 * decisión pendiente disfrazada de activo, y en este repo lo que no tiene gate
 * diverge — la lección que el árbol de servicios ya pagó con `ApiMoldTests`.
 *
 * Lo que vigila: que cada shell del catálogo tenga al menos un consumidor real
 * —montado en una plantilla, no sólo importado—. Un import no es consumo: un
 * componente importado y no montado no existe para quien usa el producto, y esa
 * distinción costó una medición equivocada al inventariar (#19).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');
/**
 * Las raíces de TODAS las plataformas construibles, no `platforms/angular` (#60).
 *
 * La regla de este gate es NEUTRAL —un shell que nadie monta es peso muerto en cualquier framework— y estaba apuntando a una ruta
 * cableada: la regla 25. La lista sale del disco, que es lo único que encuentra
 * una plataforma que nadie escribió en ningún sitio. Lo que NO cubre, dicho en
 * vez de insinuado: una plataforma cuyo árbol interno no se parezca al de
 * Angular queda invisible acá, porque este gate sigue sabiendo qué subcarpeta
 * mirar. El contrato de layout es #62; hasta entonces lo que impide que esto
 * pase en verde sin mirar nada es la red de seguridad de más abajo.
 */
const RAICES = raicesEnDisco(REPO);

/**
 * El catálogo de shells de cada plataforma que lo tenga.
 *
 * **No es `RAICES[0]`**, que sería el defecto con un paso más: hoy el primero es
 * angular y mañana el orden alfabético lo decide otro. Se recorren todas y se
 * quedan las que de verdad tienen catálogo — una plataforma nueva sin `shells/`
 * no da rojo, que es la misma asimetría de #61.
 */
const CATALOGOS = RAICES
  .map((raiz) => path.join(raiz, 'libs/shells/src'))
  .filter((dir) => existsSync(path.join(dir, 'index.ts')));

/**
 * Shells sin consumidor, con la razón por la que se acepta hoy.
 * Sacar uno de acá es cablearlo; añadir uno exige escribir por qué.
 */
const PENDIENTES = new Map([
  [
    'syn-results-map',
    'Lo montan Propiedades y Viajes. Si esta entrada aparece, es que se cayó uno ' +
      'de los dos y hay que mirarlo.',
  ],
]);

function plantillas() {
  const encontradas = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
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
  for (const raiz of RAICES) walk(path.join(raiz, 'apps'));
  return encontradas;
}

/** Los selectores del catálogo, leídos de los propios ficheros del shell. */
function selectoresDelCatalogo() {
  const selectores = new Set();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        const src = readFileSync(full, 'utf8');
        for (const m of src.matchAll(/selector:\s*'(syn-[a-z-]+)'/g)) {
          selectores.add(m[1]);
        }
      }
    }
  };
  for (const dir of CATALOGOS) walk(dir);
  return [...selectores];
}

describe('consumidores del catálogo de shells', () => {
  const selectores = selectoresDelCatalogo();

  it('el catálogo existe y se lee de los ficheros, no de una lista', () => {
    // Red de seguridad: al menos una plataforma tiene catálogo de shells. Sin
    // esto, un descubrimiento que deja de ver haría pasar en verde «ningún shell
    // sin consumidor» sobre cero shells.
    expect(CATALOGOS.length).toBeGreaterThan(0);
    expect(selectores.length).toBeGreaterThan(8);
  });

  it('cada shell del catálogo lo monta alguna app', () => {
    const html = plantillas().map((f) => readFileSync(f, 'utf8'));
    const sinConsumidor = [];

    for (const selector of selectores) {
      if (PENDIENTES.has(selector)) continue;
      // Montado de verdad: la etiqueta abierta en una plantilla.
      const montado = new RegExp(`<${selector}[\\s>]`);
      if (!html.some((src) => montado.test(src))) {
        sinConsumidor.push(selector);
      }
    }

    expect(
      sinConsumidor,
      `Estos shells del catálogo no los monta ninguna app. Una pieza sin consumidor\n` +
        `es una decisión pendiente disfrazada de activo — cablealo, o muévelo a\n` +
        `PENDIENTES con la razón escrita:\n  ` + sinConsumidor.join(', '),
    ).toEqual([]);
  });

  it('la lista de pendientes no nombra shells que ya no existen', () => {
    const fantasmas = [...PENDIENTES.keys()].filter((s) => !selectores.includes(s));
    expect(
      fantasmas,
      `PENDIENTES nombra shells que el catálogo ya no publica: ${fantasmas.join(', ')}`,
    ).toEqual([]);
  });
});
