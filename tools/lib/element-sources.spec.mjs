import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  descubrirFuentes, resolverFramework, revisarFrameworks, tierDelDisco,
  elegirPlataforma, SIN_FUENTE_PROPIA, PLATAFORMAS,
} from './element-sources.mjs';
import { loadRegistry, contratoDelManifiesto } from './synergos-config.mjs';

/**
 * El framework de cada elemento (issue #42).
 *
 * Lo que este gate existe para impedir NO es que alguien escriba mal un
 * framework: es que NADIE lo escriba. Los 132 eran Angular implícito, y el
 * implícito no deja un hueco — AFIRMA, y afirma lo que nadie decidió. La CDN sí
 * lo sabía (el segmento está en la ruta desde siempre); lo que el CMS lee, no.
 *
 * Por eso el gate se mide contra el DISCO y no contra una lista: la fuente de
 * verdad es la misma que usa el build —cada carpeta bajo `apps/` con un
 * `src/main.ts`—, y una lista escrita a mano es exactamente lo que este repo
 * documenta cinco veces como la forma de equivocarse.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** El disco de verdad, con las rutas relativas a la raíz del repo. */
const discoReal = {
  listar: (dir) => {
    try {
      return readdirSync(resolve(ROOT, dir), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  },
  existe: (ruta) => existsSync(resolve(ROOT, ruta)),
};

/** Un árbol de mentira: el conjunto de rutas que existen. */
const discoFalso = (rutas) => {
  const hay = new Set(rutas);
  const hijos = (dir) => {
    const prefijo = `${dir}/`;
    const nombres = new Set();
    for (const ruta of hay) {
      if (!ruta.startsWith(prefijo)) continue;
      nombres.add(ruta.slice(prefijo.length).split('/')[0]);
    }
    // Sólo carpetas: un `src/main.ts` no se lista como carpeta.
    return [...nombres].filter((n) => !n.includes('.'));
  };
  return { listar: hijos, existe: (r) => hay.has(r) };
};

const APPS = 'platforms/angular/apps';

describe('descubrirFuentes', () => {
  it('cada carpeta con src/main.ts es un elemento, y su plataforma es su framework', () => {
    const fuentes = descubrirFuentes(
      discoFalso([`${APPS}/elements/modules/hero/src/main.ts`]),
    );

    expect(fuentes.get('hero')).toEqual({
      framework: 'angular',
      dir: `${APPS}/elements/modules/hero`,
      tier: 'module',
    });
  });

  it('el tier sale del segmento de carpeta, y cuando no hay segmento dice null', () => {
    // `apps/domains/shop/*` y `apps/experiences/*` no llevan tier en la ruta.
    // Inventarle uno sería la misma fabricación que este repo persigue en otros
    // diez sitios: ahí el tier lo sabe el registry, no el disco.
    const fuentes = descubrirFuentes(
      discoFalso([
        `${APPS}/elements/primitives/badge/src/main.ts`,
        `${APPS}/domains/shop/cart-item/src/main.ts`,
      ]),
    );

    expect(tierDelDisco('badge', fuentes)).toBe('primitive');
    expect(tierDelDisco('cart-item', fuentes)).toBeNull();
  });
});

describe('resolverFramework', () => {
  const entrada = (name, tag = `synergos-${name}`) => ({ name, tag, alias: 'elementX', tier: 'module' });

  it('fuente propia manda', () => {
    const fuentes = descubrirFuentes(discoFalso([`${APPS}/elements/modules/hero/src/main.ts`]));
    expect(resolverFramework(entrada('hero'), fuentes)).toMatchObject({
      framework: 'angular',
      origen: 'fuente propia',
    });
  });

  it('una implementación compartida sirve al resto de tipos del CMS', () => {
    // `heading`, `paragraph`, `rich-text`, `eyebrow`, `quote` y `label` los
    // pinta el MISMO `synergos-text-block`. `publish.mjs` ya cae al dist/ del
    // tag para ellos; si acá no se hiciera lo mismo, seis entradas del registry
    // se quedarían sin framework derivable y habría que declararlas a mano —
    // seis excepciones donde no hace falta ninguna.
    const fuentes = descubrirFuentes(
      discoFalso([`${APPS}/elements/primitives/text-block/src/main.ts`]),
    );

    expect(resolverFramework(entrada('heading', 'synergos-text-block'), fuentes)).toMatchObject({
      framework: 'angular',
      origen: 'implementación compartida: text-block',
    });
  });

  it('sin fuente y sin excepción declarada, no se adivina', () => {
    const fuentes = descubrirFuentes(discoFalso([]));
    expect(resolverFramework(entrada('fantasma'), fuentes)).toBeNull();
  });
});

describe('revisarFrameworks', () => {
  const FRAMEWORKS = ['angular', 'react', 'svelte', 'vanilla'];
  const fuentesCon = (...nombres) =>
    descubrirFuentes(discoFalso(nombres.map((n) => `${APPS}/elements/modules/${n}/src/main.ts`)));

  // Las excepciones declaradas tienen que estar en el registry del fixture: el
  // gate también mira el sentido de vuelta, y si no estuvieran, TODOS estos
  // tests arrastrarían dos errores de «la excepción sobra» que no son lo que
  // cada uno prueba.
  const excepcionesComoEntradas = () =>
    Object.entries(SIN_FUENTE_PROPIA).map(([name, { framework }]) => ({
      name, tag: `synergos-${name}`, alias: 'elementX', tier: 'module', framework,
    }));

  it('una entrada sin framework se nombra, y no se le pone uno', () => {
    // Éste es EL defecto del issue #42, escrito como test: la entrada existe,
    // el disco sabe de qué es, y el registry no lo dice. Antes eso publicaba
    // igual.
    const errores = revisarFrameworks(
      [...excepcionesComoEntradas(), { name: 'hero', tag: 'synergos-hero', tier: 'module' }],
      fuentesCon('hero'),
      FRAMEWORKS,
    );

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('no declara "framework"');
  });

  it('una entrada que declara lo que el disco desmiente se para', () => {
    const errores = revisarFrameworks(
      [...excepcionesComoEntradas(), { name: 'hero', tag: 'synergos-hero', tier: 'module', framework: 'svelte' }],
      fuentesCon('hero'),
      FRAMEWORKS,
    );

    expect(errores[0]).toContain('declara framework "svelte"');
    expect(errores[0]).toContain('"angular"');
  });

  it('una excepción cuyo elemento YA tiene fuente rompe el build', () => {
    // El sentido de vuelta, que es el que se olvida: una excepción que sobra
    // deja de leerse, y la siguiente que entre lo hará sin discusión.
    const nombre = Object.keys(SIN_FUENTE_PROPIA)[0];
    const errores = revisarFrameworks(excepcionesComoEntradas(), fuentesCon(nombre), FRAMEWORKS);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('Borrá la excepción');
  });

  it('una excepción que nombra algo que no está en el registry sobra', () => {
    const errores = revisarFrameworks([], fuentesCon(), FRAMEWORKS);
    expect(errores.join('\n')).toContain('no está en el registry');
  });
});

describe('el registry de verdad contra el disco de verdad', () => {
  it('las 132 entradas declaran el framework que las construye', () => {
    const registro = loadRegistry();
    const { frameworks } = contratoDelManifiesto();
    const fuentes = descubrirFuentes({ ...discoReal, plataformas: PLATAFORMAS });

    expect(revisarFrameworks(registro, fuentes, frameworks)).toEqual([]);
  });

  it('sólo dos entradas necesitan declararlo sin fuente, y cada una lleva su razón', () => {
    // El número no es el gate —el gate es el test de arriba—, pero tenerlo
    // escrito hace que crecer la tabla de excepciones sea un acto visible.
    const registro = loadRegistry();
    const fuentes = descubrirFuentes({ ...discoReal, plataformas: PLATAFORMAS });
    const declaradas = registro.filter(
      (e) => resolverFramework(e, fuentes)?.origen === 'declarado sin fuente',
    );

    expect(declaradas.map((e) => e.name).sort()).toEqual(['module-mount', 'stat-counter']);
    for (const nombre of Object.keys(SIN_FUENTE_PROPIA)) {
      expect(SIN_FUENTE_PROPIA[nombre].razon.length).toBeGreaterThan(40);
    }
  });
});

describe('elegirPlataforma', () => {
  // Dos plataformas de mentira: hoy sólo existe angular, así que el caso de
  // «el bundle está en la otra» NO se puede ver fallar contra el disco real.
  // Se prueba acá, que es el motivo de que la decisión no viva cableada dentro
  // de publish.mjs.
  const plataformas = [
    { name: 'angular', resolveBundlePath: (n) => `dist/angular/${n}/main.js` },
    { name: 'svelte', resolveBundlePath: (n) => `dist/svelte/${n}/main.js` },
  ];
  const conBundles = (...rutas) => {
    const hay = new Set(rutas);
    return (r) => hay.has(r);
  };

  it('publica por la plataforma que el elemento declara', () => {
    const r = elegirPlataforma(
      { name: 'hero', framework: 'angular' },
      plataformas,
      conBundles('dist/angular/hero/main.js'),
    );

    expect(r.plataforma.name).toBe('angular');
  });

  it('un framework que ninguna plataforma publica se para, en vez de quedar en "not built"', () => {
    const r = elegirPlataforma({ name: 'hero', framework: 'react' }, plataformas, conBundles());

    expect(r.error).toContain('ninguna plataforma lo publica');
    expect(r.plataforma).toBeUndefined();
  });

  it('un bundle construido en OTRA plataforma no se publica bajo el slot declarado', () => {
    // El slot del CDN lleva el framework en la ruta. Publicar ahí el bundle de
    // otra plataforma deja el manifiesto mintiendo sobre quién lo produjo — y
    // el que lo lee no tiene forma de saberlo.
    const r = elegirPlataforma(
      { name: 'hero', framework: 'angular' },
      plataformas,
      conBundles('dist/svelte/hero/main.js'),
    );

    expect(r.error).toContain('bundle construido en la plataforma "svelte"');
  });
});
