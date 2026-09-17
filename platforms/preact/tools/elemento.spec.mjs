import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXTERNALS } from '../cdn.config.mjs';

const BASE = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(BASE, 'dist/badge/browser/main.js');

/**
 * El criterio de hecho de #64: **el elemento publicado HIDRATA**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE IMPORTA EL BUNDLE, NO EL FUENTE — Y ESA ES LA MITAD QUE PRUEBA ALGO.
 *
 * La mutación 3 del ticket es quitar `customElements.define` del adaptador. El
 * componente sigue existiendo, el `.tsx` sigue compilando, y un spec que hiciera
 * `render(<BadgeElement text="x" />)` **pasaría en verde con el tag muerto**. Es
 * la regla 5 del `CLAUDE.md`: un test que llama al método no ve que falte el
 * llamador.
 *
 * Lo que se hace acá es lo que hace el navegador: cargar el módulo publicado,
 * poner el tag en el documento y mirar el DOM.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('el badge de Preact, desde su bundle publicado', () => {
  beforeAll(async () => {
    // Sin `dist` esto NO se salta: un gate que informa «✓» sobre nada es la
    // regla 25(c). El mensaje dice cómo arreglarlo.
    expect(
      existsSync(BUNDLE),
      `no existe ${BUNDLE} — corré \`npm run build\` en platforms/preact antes de los specs`,
    ).toBe(true);
    await import(BUNDLE);
  });

  /** Lo que hace el navegador: poner el tag y dejar que el custom element monte. */
  const colocar = (atributos = {}) => {
    const host = document.createElement('synergos-badge');
    for (const [clave, valor] of Object.entries(atributos)) host.setAttribute(clave, valor);
    document.body.appendChild(host);
    return host;
  };

  it('registra el tag — sin esto no hay elemento, sólo un componente sano', () => {
    expect(customElements.get('synergos-badge')).toBeTypeOf('function');
  });

  it('EL CRITERIO: colocado en el documento, hidrata con el texto del editor', () => {
    const host = colocar({ text: 'Nuevo' });

    const pintado = host.querySelector('.syn-badge');
    expect(pintado, 'el tag existe pero no pintó nada: el adaptador no montó').not.toBeNull();
    expect(pintado.textContent).toBe('Nuevo');
  });

  it('lee el `config` como JSON, que es como lo escribe el CMS', () => {
    // El editor escribe un objeto en el DocType y el CMS lo emite serializado en
    // el atributo. Si el elemento sólo supiera leer props sueltas, la mitad del
    // contrato con el CMS no funcionaría y la pantalla saldría vacía, sin error.
    const host = colocar({ config: JSON.stringify({ text: 'Oferta', tone: 'brand' }) });

    const pintado = host.querySelector('.syn-badge');
    expect(pintado.textContent).toBe('Oferta');
    expect(pintado.className).toContain('syn-badge--brand');
  });

  it('el atributo suelto GANA sobre el config — el mismo orden que en Angular', () => {
    // `resolveConfigValue(override, config, fallback)`. Es la misma función, la
    // misma de `vitals/core/src/inputs/` (#63), no una copia: si las dos
    // plataformas resolvieran distinto, el mismo contenido se vería distinto
    // según qué elemento lo pintara.
    const host = colocar({ config: JSON.stringify({ text: 'del config' }), text: 'del atributo' });

    expect(host.querySelector('.syn-badge').textContent).toBe('del atributo');
  });

  it('un `tone` que no está en el vocabulario cae al por defecto, no a la clase inventada', () => {
    const host = colocar({ text: 'x', tone: 'fucsia' });

    const clases = host.querySelector('.syn-badge').className;
    expect(clases).toContain('syn-badge--neutral');
    expect(clases).not.toContain('fucsia');
  });

  it('instala el CSS del design system UNA vez, aunque haya varios badges', () => {
    colocar({ text: 'uno' });
    colocar({ text: 'dos' });

    const hojas = document.querySelectorAll('style[data-synergos-preact]');
    expect(hojas.length).toBe(1);
    expect(hojas[0].textContent).toContain('.syn-badge');
  });

  it('al quitarlo del documento devuelve el host como lo encontró', () => {
    // `destroy()` que deja nodos pintados afirma que limpió y no limpió. El
    // corte es el mismo que `hijosAlMontar` del lado de Angular.
    const host = colocar({ text: 'efímero' });
    expect(host.querySelector('.syn-badge')).not.toBeNull();

    host.remove();
    expect(host.querySelector('.syn-badge')).toBeNull();
  });

  it('el bundle NO empaqueta su framework — deja los bare imports al import map', () => {
    // Si un elemento empaquetara Preact, la idea fundacional del repo —veinte
    // elementos, UN runtime— dejaría de cumplirse sin que nada fallara. Y ya
    // pasó en esta misma HU: un `alias` pisaba a `external` y el badge salía a
    // 17.525 B con el adaptador y el design system dentro.
    const fuente = readFileSync(BUNDLE, 'utf8');
    const importados = [...fuente.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);

    // ⚠ NO se afirma una lista escrita a mano. La primera versión de este test
    // exigía `from"preact"` y se puso roja **por estar mal el test**: el
    // elemento importa `preact/jsx-runtime`, y `preact` a secas lo importa el
    // adaptador. Una aserción por nombre convierte un detalle del empaquetado en
    // un contrato, y el que se cae es quien toca el build por una razón
    // legítima. Lo que de verdad importa es la PROPIEDAD: todo lo que el bundle
    // importa está declarado como external, o sea lo resuelve el import map.
    expect(importados.length).toBeGreaterThan(0);
    for (const especificador of importados) {
      expect(EXTERNALS, `${especificador} no está en EXTERNALS`).toContain(especificador);
    }

    // El tamaño es la otra mitad: los bare imports pueden estar Y el bundle
    // llevar además una copia. Ya pasó en esta misma HU —un `alias` pisaba a
    // `external` y el badge salía a 17.525 B— y no falló nada: compilaba,
    // publicaba y entraba en el techo de su tier (24 KB). Sólo se rompía la
    // idea fundacional del repo, en silencio.
    expect(fuente.length).toBeLessThan(4_000);
  });
});
