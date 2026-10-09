import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { raicesEnDisco } from './frameworks.mjs';
import { aliasDeLavado, lavadosComoTinta } from './tinta-de-lavado.mjs';

/**
 * Ningún texto se pinta con un token de LAVADO (UI#91). La medición y la razón están en la
 * cabecera de `tinta-de-lavado.mjs`.
 */

/**
 * Los que todavía pintan texto con un lavado POR UN ALIAS de su hoja, censados el 2026-10-09 al
 * arreglar el aviso de rechazo del asistente de la compra (ADR 0140 F4, CMS#201). Son el mismo
 * defecto que el asistente —texto a 1,1-1,3:1 en los siete temas— pero heredados y fuera de la
 * compra de la F4 (consola, autoría, formularios, reseñas, el stepper, el selector de pasajeros,
 * el vendedor y las comillas decorativas de los testimonios), así que se bajan cada uno en su
 * ticket. El censo sólo baja: un alias nuevo es rojo, y uno arreglado que siga acá también.
 */
const HEREDADOS_POR_ALIAS = [
  'platforms/angular/apps/elements/compositions/form-stepper/src/form-stepper/form-stepper.scss --fs-danger',
  'platforms/angular/apps/elements/compositions/pax-selector/src/pax-selector/pax-selector.scss --px-step-text',
  'platforms/angular/apps/elements/compositions/testimonial-item/src/testimonial-item/testimonial-item.scss --tmi-decorative-quote',
  'platforms/angular/apps/elements/modules/seller/src/seller/seller.scss --sl-brand',
  'platforms/angular/apps/elements/modules/testimonial-section/src/testimonial-section/testimonial-section.scss --tss-decorative-quote',
  'platforms/angular/libs/shells/src/authoring/authoring-wizard.scss --shw-done',
  'platforms/angular/libs/shells/src/console/console-shell.scss --shc-down',
  'platforms/angular/libs/shells/src/console/console-shell.scss --shc-up',
  'platforms/angular/libs/shells/src/forms/dynamic-form-shell.scss --sdf-danger',
  'platforms/angular/libs/shells/src/forms/dynamic-form-shell.scss --sdf-success',
  'platforms/angular/libs/shells/src/reviews/review-panel.scss --srv-danger',
  'platforms/angular/libs/shells/src/reviews/review-panel.scss --srv-ok-text',
  'platforms/angular/libs/shells/src/reviews/review-panel.scss --srv-star',
];

const REPO = path.resolve(import.meta.dirname, '../..');

function hojas(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|\.test-out)$/.test(e.name)) hojas(full, salida);
    } else if (/\.(scss|css)$/.test(e.name) || (/\.(ts|tsx)$/.test(e.name) && !/\.spec\./.test(e.name))) {
      salida.push(full);
    }
  }
  return salida;
}

const fuentes = raicesEnDisco(REPO).flatMap((raiz) => [
  ...hojas(path.join(raiz, 'apps')),
  ...hojas(path.join(raiz, 'libs')),
]);

describe('un lavado de estado no es tinta (UI#91)', () => {
  it('hay hojas que mirar — sin sujeto, lo de abajo pasa en verde sin mirar', () => {
    expect(fuentes.filter((f) => f.endsWith('.scss')).length).toBeGreaterThan(150);
  });

  it('ningún `color:` de las plataformas nombra un -surface, -soft o -border de estado', () => {
    const malos = fuentes.flatMap((f) =>
      lavadosComoTinta(readFileSync(f, 'utf8'))
        .filter((uso) => !uso.alias)
        .map((uso) => `${path.relative(REPO, f)}:${uso.linea} pinta texto con ${uso.token} → usá su -text`),
    );
    expect(
      malos,
      'Un lavado es un rgb(… / 0.10): como tinta da 1,1-1,3:1 en los siete temas del CMS, y en ' +
        'el banco no se ve porque el respaldo Sass es sólido. La tinta es el -text de la misma ' +
        'familia:\n  ' + malos.join('\n  '),
    ).toEqual([]);
  });

  it('ni por un alias de su hoja: sólo los censados, y el censo sólo baja (ADR 0140 F4)', () => {
    const porAlias = new Map();
    for (const f of fuentes) {
      for (const uso of lavadosComoTinta(readFileSync(f, 'utf8')).filter((u) => u.alias)) {
        const clave = `${path.relative(REPO, f).replace(/\\/g, '/')} ${uso.alias}`;
        porAlias.set(clave, [...(porAlias.get(clave) ?? []), `:${uso.linea} → ${uso.token}`]);
      }
    }
    const nuevos = [...porAlias.keys()].filter((c) => !HEREDADOS_POR_ALIAS.includes(c));
    const resueltos = HEREDADOS_POR_ALIAS.filter((c) => !porAlias.has(c));
    expect(
      nuevos.map((c) => `${c} ${porAlias.get(c).join(' ')}`),
      'Un alias de la hoja que vale un lavado pinta el mismo texto invisible (el aviso de rechazo ' +
        'del asistente de la compra daba 1,14:1). Definí el alias con el -text de la familia:',
    ).toEqual([]);
    expect(resueltos, 'Ya no pintan con un lavado: sacalos de HEREDADOS_POR_ALIAS.').toEqual([]);
  });

  it('la compra de la F4 —asistente, carrito y acuse— no pinta ningún texto con un lavado', () => {
    const compra = ['checkout/checkout-wizard.scss', 'cart/cart-shell.scss', 'confirmation/confirmation-shell.scss'].map(
      (h) => path.join(REPO, 'platforms/angular/libs/shells/src', h),
    );
    for (const hoja of compra) expect(existsSync(hoja), hoja).toBe(true);
    expect(
      compra.flatMap((h) => lavadosComoTinta(readFileSync(h, 'utf8')).map((u) => `${path.relative(REPO, h)}:${u.linea} → ${u.token}`)),
    ).toEqual([]);
  });
});

describe('el detector', () => {
  it('caza el lavado como tinta, con respaldo o sin él', () => {
    const hoja = [
      '.a { color: var(--syn-color-state-danger-surface, #{syn.$color-danger-500}); }',
      '.b {',
      '  color: var(--syn-color-state-warning-soft);',
      '}',
      ".c { color:var(--syn-color-state-success-border) }",
    ].join('\n');
    expect(lavadosComoTinta(hoja).map((u) => u.linea)).toEqual([1, 3, 5]);
  });

  it('el lavado como FONDO o como borde es su sitio, no se toca', () => {
    const hoja = [
      'background: var(--syn-color-state-danger-soft, transparent);',
      'background-color: var(--syn-color-state-danger-surface);',
      'border-color: var(--syn-color-state-danger-border);',
      'color: var(--syn-color-state-danger-text, #dc2626);',
    ].join('\n');
    expect(lavadosComoTinta(hoja)).toEqual([]);
  });

  it('la prosa que EXPLICA el defecto no cuenta', () => {
    const hoja = [
      '// antes: color: var(--syn-color-state-danger-surface) daba 1,15:1',
      '/* color: var(--syn-color-state-warning-surface) */',
      'color: var(--syn-color-state-warning-text, #8a6a12);',
    ].join('\n');
    expect(lavadosComoTinta(hoja)).toEqual([]);
  });

  it('caza también el estilo en línea de un componente', () => {
    const ts = "styles: [`.x { color: var(--syn-color-state-danger-surface); }`],";
    expect(lavadosComoTinta(ts)).toHaveLength(1);
  });

  it('caza el lavado que llega por un alias de la hoja, y por una cadena de alias (ADR 0140 F4)', () => {
    const hoja = [
      ':host {',
      '  --shw-danger: var(--syn-color-state-danger-surface, #{syn.$color-danger-500});',
      '  --shw-aviso: var(--shw-danger);',
      '}',
      '.a { color: var(--shw-danger); }',
      '.b { color: var(--shw-aviso, red); }',
    ].join('\n');
    expect(lavadosComoTinta(hoja)).toEqual([
      { linea: 5, token: '--syn-color-state-danger-surface', alias: '--shw-danger' },
      { linea: 6, token: '--syn-color-state-danger-surface', alias: '--shw-aviso' },
    ]);
  });

  it('un alias del -text, o un alias de lavado usado como FONDO, no cuenta', () => {
    const hoja = [
      ':host {',
      '  --shw-danger: var(--syn-color-state-danger-text, #{syn.$color-danger-600});',
      '  --shw-danger-soft: var(--syn-color-state-danger-soft, #{syn.$color-danger-100});',
      '}',
      '.a { color: var(--shw-danger); background: var(--shw-danger-soft); }',
      '// antes: --shw-x: var(--syn-color-state-danger-surface); color: var(--shw-x)',
    ].join('\n');
    expect(lavadosComoTinta(hoja)).toEqual([]);
  });

  it('basta con que UNA definición del alias sea un lavado: un modificador que lo redefine pinta igual', () => {
    const hoja = [
      ':host { --q: var(--syn-color-overlay-medium); }',
      ':host(.is-warm) { --q: var(--syn-color-state-warning-surface); }',
      '.quote { color: var(--q); }',
    ].join('\n');
    expect(aliasDeLavado(hoja).get('--q')).toBe('--syn-color-state-warning-surface');
    expect(lavadosComoTinta(hoja).map((u) => u.linea)).toEqual([3]);
  });
});
