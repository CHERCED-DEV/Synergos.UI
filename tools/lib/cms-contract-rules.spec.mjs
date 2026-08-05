import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeE1,
  computeE2,
  applyBaseline,
  validateBaselineShape,
  staleExclusions,
  listasNoPermitidas,
  LISTAS_PERMITIDAS,
} from './cms-contract-rules.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const VALIDADOR = resolve(AQUI, '..', 'validate-cms-contracts.mjs');
const BASELINE = resolve(AQUI, '..', 'cms-contract-baseline.json');

const el = (alias, name = 'x', tier = 'module') => ({ alias, name, tier, tag: `synergos-${name}` });

describe('computeE1 — alias del registry sin ContentType', () => {
  it('registry vacio no da desajustes', () => {
    expect(computeE1([], new Set(['elementSynHero']))).toEqual([]);
  });

  it('el alias que SI esta en el CMS no se reporta', () => {
    expect(computeE1([el('elementSynHero')], new Set(['elementSynHero']))).toEqual([]);
  });

  it('el alias que NO esta en el CMS se reporta con su nombre y tier', () => {
    const r = computeE1([el('elementSynHero', 'hero', 'module')], new Set());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ alias: 'elementSynHero', name: 'hero', tier: 'module' });
  });

  it('filtra: solo los que faltan', () => {
    const r = computeE1([el('a'), el('b'), el('c')], new Set(['b']));
    expect(r.map(e => e.alias)).toEqual(['a', 'c']);
  });
});

describe('computeE2 — ContentType que el registry no declara', () => {
  it('ignora los alias sin prefijo de elemento', () => {
    expect(computeE2(new Set(['compDomGrid', 'siteConfigSettings']), new Set(), new Set())).toEqual([]);
  });

  it('reporta element* y experience* ausentes del registry', () => {
    const r = computeE2(new Set(['elementSynFoo', 'experienceBar']), new Set(), new Set());
    expect(r.map(e => e.alias).sort()).toEqual(['elementSynFoo', 'experienceBar']);
  });

  it('CMS_INTERNAL_ALIASES lo silencia', () => {
    const r = computeE2(new Set(['elementSynFoo']), new Set(), new Set(['elementSynFoo']));
    expect(r).toEqual([]);
  });
});

describe('applyBaseline', () => {
  const err = a => ({ alias: a, name: a, tier: 'module' });

  it('sin baseline, todo pasa a kept', () => {
    const r = applyBaseline([err('a'), err('b')], new Map());
    expect(r.kept).toHaveLength(2);
    expect(r.baselined).toEqual([]);
  });

  it('lo conocido sale de kept pero NO desaparece: vuelve en baselined con su motivo', () => {
    const base = new Map([['a', { alias: 'a', reason: 'porque si', owner: 'UI' }]]);
    const r = applyBaseline([err('a'), err('b')], base);
    expect(r.kept.map(e => e.alias)).toEqual(['b']);
    expect(r.baselined).toHaveLength(1);
    expect(r.baselined[0]).toMatchObject({ alias: 'a', reason: 'porque si', owner: 'UI' });
  });

  it('la entrada de baseline que ya no corresponde a nada sale como stale', () => {
    const base = new Map([['fantasma', { alias: 'fantasma', reason: 'x' }]]);
    const r = applyBaseline([err('a')], base);
    expect(r.stale).toEqual(['fantasma']);
    expect(r.kept.map(e => e.alias)).toEqual(['a']);
  });

  it('es idempotente: aplicarla dos veces da lo mismo', () => {
    const base = new Map([['a', { alias: 'a', reason: 'x' }]]);
    const uno = applyBaseline([err('a'), err('b')], base);
    const dos = applyBaseline([err('a'), err('b')], base);
    expect(dos).toEqual(uno);
  });
});

describe('validateBaselineShape — sin motivo no hay silencio', () => {
  it('la baseline bien formada no da problemas', () => {
    expect(validateBaselineShape({
      e1_registryAliasMissingFromCms: [{ alias: 'a', reason: 'porque si' }],
      e2_cmsAliasMissingFromRegistry: [],
    })).toEqual([]);
  });

  it('una entrada sin `reason` es un problema', () => {
    const p = validateBaselineShape({ e1_registryAliasMissingFromCms: [{ alias: 'a' }] });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('reason');
  });

  it('`reason` en blanco tampoco vale', () => {
    const p = validateBaselineShape({ e1_registryAliasMissingFromCms: [{ alias: 'a', reason: '   ' }] });
    expect(p).toHaveLength(1);
  });

  it('una entrada sin `alias` es un problema', () => {
    const p = validateBaselineShape({ e2_cmsAliasMissingFromRegistry: [{ reason: 'x' }] });
    expect(p[0]).toContain('alias');
  });

  it('el fichero REAL del repo cumple', () => {
    expect(validateBaselineShape(JSON.parse(readFileSync(BASELINE, 'utf8')))).toEqual([]);
  });
});

describe('staleExclusions — que una exclusion caduque en silencio es el defecto #16', () => {
  it('sin exclusiones, nada rancio', () => {
    expect(staleExclusions(new Set(), new Set(['a']))).toEqual([]);
  });

  it('la exclusion cuyo alias sigue vivo no es rancia', () => {
    expect(staleExclusions(new Set(['a']), new Set(['a']))).toEqual([]);
  });

  it('la exclusion cuyo alias ya no existe se delata', () => {
    expect(staleExclusions(new Set(['a', 'b']), new Set(['a']))).toEqual(['b']);
  });

  it('sale ordenado, para que el diff del arreglo sea legible', () => {
    expect(staleExclusions(new Set(['z', 'a', 'm']), new Set())).toEqual(['a', 'm', 'z']);
  });
});

// ── El gate estructural — es el que habria cazado el #16 ─────────────────────
//
// El defecto no estaba en el COMPORTAMIENTO del validador: hacia exactamente lo
// que decia. Estaba en que se podia anadir una lista de silencio nueva sin que
// nada lo notara, y una de ellas se justificaba con una clase inexistente. Un
// test de comportamiento habria comprobado el contenido de la lista, no el
// derecho a que exista.

describe('el validador no puede declarar listas de supresion propias', () => {
  const fuente = readFileSync(VALIDADOR, 'utf8');

  it('hoy no declara ninguna fuera de las permitidas', () => {
    expect(listasNoPermitidas(fuente)).toEqual([]);
  });

  it('detecta una lista nueva no permitida', () => {
    const mutado = `${fuente}\nconst ALIAS_QUE_IGNORAMOS = new Set(['elementFoo']);\n`;
    expect(listasNoPermitidas(mutado)).toEqual(['ALIAS_QUE_IGNORAMOS']);
  });

  it('las tres listas del #16 volverian a saltar', () => {
    for (const nombre of ['SCHEMA_MANAGED_ALIASES', 'LEGACY_RENAMED_ALIASES', 'UI_ONLY_ALIASES']) {
      expect(listasNoPermitidas(`const ${nombre} = new Set([\n  'x',\n]);\n`)).toEqual([nombre]);
      expect(LISTAS_PERMITIDAS.has(nombre)).toBe(false);
    }
  });

  it('las permitidas no saltan', () => {
    for (const nombre of LISTAS_PERMITIDAS) {
      expect(listasNoPermitidas(`const ${nombre} = new Set(['x']);\n`)).toEqual([]);
    }
  });

  it('las tres del #16 ya no estan en el fuente', () => {
    for (const nombre of ['SCHEMA_MANAGED_ALIASES', 'LEGACY_RENAMED_ALIASES', 'UI_ONLY_ALIASES']) {
      expect(fuente).not.toMatch(new RegExp(`^const ${nombre}\\s*=`, 'm'));
    }
  });

  it('CMS_INTERNAL_ALIASES esta permitida pero SOLO porque se comprueba su caducidad', () => {
    expect(LISTAS_PERMITIDAS.has('CMS_INTERNAL_ALIASES')).toBe(true);
    expect(fuente).toMatch(/staleExclusions\(CMS_INTERNAL_ALIASES/);
  });
});
