import { describe, it, expect } from 'vitest';

import { buildManifest, validateManifest, buildContractEntry } from './manifest-builder.mjs';
import { loadRegistry, loadInputs, contratoDelManifiesto } from './synergos-config.mjs';

/**
 * El manifiesto contra el contrato que dice cumplir (issue #43).
 *
 * `ElementManifest` declaraba la forma del `manifest.json` que va al CDN —el
 * fichero que el CMS y las herramientas leen para saber qué expone un bundle— y
 * **no lo importaba nadie**: sólo su propio `index.ts`. Quien lo escribe es un
 * `.mjs` sin tipos, así que renombrar una clave emitida compilaba, publicaba, y
 * el que la leía degradaba en silencio.
 *
 * Por eso lo que se cruza acá es **la clave serializada** y no el tipo, y por
 * eso la mutación que prueba este gate no es borrar un campo —en un `.mjs` eso
 * no rompe nada— sino **renombrarlo**, que es la forma real de la deriva.
 */

const CONTRATO = contratoDelManifiesto();
const entrada = {
  name: 'hero',
  alias: 'elementCompHero',
  tag: 'synergos-hero',
  tier: 'module',
  framework: 'angular',
};

describe('validateManifest', () => {
  it('lo que buildManifest emite cumple el contrato', () => {
    expect(validateManifest(buildManifest(entrada, '1.2.3', []), CONTRATO)).toEqual([]);
  });

  it('una clave renombrada se caza — que es la forma real de la deriva', () => {
    const { tier, ...sinTier } = buildManifest(entrada, '1.2.3', []);
    const errores = validateManifest({ ...sinTier, elementTier: tier }, CONTRATO);

    expect(errores.join(' ')).toContain('falta la clave "tier"');
    expect(errores.join(' ')).toContain('emite la clave "elementTier"');
  });

  it('un framework fuera de la unión declarada no pasa', () => {
    const errores = validateManifest(
      buildManifest({ ...entrada, framework: 'reakt' }, '1.2.3', []),
      CONTRATO,
    );
    expect(errores.join(' ')).toContain('framework "reakt"');
  });

  it('un tier que el contrato del manifiesto no sabe expresar no pasa', () => {
    // `ElementRegistryTier` admite `experience` y `ElementTier` no. Hoy nadie
    // lo usa, así que está latente; el día que alguien lo declare, esto se pone
    // rojo y lo nombra en vez de publicarlo sin techo de tamaño.
    const errores = validateManifest(
      buildManifest({ ...entrada, tier: 'experience' }, '1.2.3', []),
      CONTRATO,
    );
    expect(errores.join(' ')).toContain('tier "experience"');
  });

  it('entryScript está fijado en el contrato, y se comprueba', () => {
    const m = { ...buildManifest(entrada, '1.2.3', []), entryScript: 'index.js' };
    expect(validateManifest(m, CONTRATO).join(' ')).toContain('entryScript "index.js"');
  });

  it('un contrato leído a medias no bendice nada por omisión', () => {
    // El modo de fallo silencioso de un gate que parsea fuente: no encuentra
    // nada, y entonces TODO pasa. `contratoDelManifiesto` falla antes de
    // llegar acá, pero la función también tiene que decirlo si alguien la
    // llama con un contrato vacío.
    const vacio = { claves: [], frameworks: [], tiers: [] };
    const errores = validateManifest(buildManifest(entrada, '1.2.3', []), vacio);

    expect(errores.length).toBeGreaterThan(0);
    expect(errores.join(' ')).toContain('que ElementManifest no declara');
  });
});

describe('las 132 entradas del registry producen un manifiesto válido', () => {
  it('ninguna se publica con una forma que el contrato no reconoce', () => {
    const registro = loadRegistry();
    const inputs = loadInputs();

    const rotas = registro
      .map((e) => ({ name: e.name, errores: validateManifest(buildManifest(e, '0.1.0', inputs[e.name] ?? []), CONTRATO) }))
      .filter((r) => r.errores.length > 0);

    expect(rotas).toEqual([]);
    expect(registro.length).toBeGreaterThan(100);
  });

  it('el contrato del CMS (contracts.json) lleva el framework de cada elemento', () => {
    // Es lo que el CMS lee en su CI. Sin esta clave, «de qué framework es este
    // bundle» seguía siendo algo que sólo sabía la ruta del CDN.
    expect(buildContractEntry(entrada, [])).toMatchObject({ framework: 'angular' });
  });
});
