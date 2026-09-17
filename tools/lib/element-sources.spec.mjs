import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  descubrirFuentes, todasLasFuentes, revisarFuentesDuplicadas,
  implementacionesDe, SHOWCASE_MULTIPLATAFORMA,
  resolverFramework, revisarFrameworks, tierDelDisco,
  elegirPlataforma, resolverTier, SIN_FUENTE_PROPIA, PLATAFORMAS,
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

/**
 * Las dos plataformas, para los casos de #59.
 *
 * ⚠ **Las entradas son DISTINTAS a propósito** (#64). Con las dos en `main.ts`
 * el fixture no ejercita `PLATFORMS[].entrada`: quitar la declaración y volver a
 * cablear `src/main.ts` en `todasLasFuentes` pasaría en verde, que es la regla 7
 * —una mutación que no cambia el resultado no prueba nada—. La segunda usa la
 * extensión que de verdad usa una plataforma de JSX, que es el caso que costó
 * que esto se decidiera.
 */
const DOS_PLATAFORMAS = [
  { framework: 'angular', apps: 'platforms/angular/apps', entrada: 'src/main.ts' },
  { framework: 'react', apps: 'platforms/react/apps', entrada: 'src/main.tsx' },
];

describe('dos fuentes para el mismo elemento (#59)', () => {
  // EL FIXTURE TIENE QUE TENER EL ELEMENTO EN LAS DOS. Con `badge` sólo en
  // angular y `hero` sólo en react el `Map` no colapsa nada y la mutación no
  // prueba nada — regla 7. Por eso `badge` está dos veces y `hero` una: hace
  // falta el caso que NO colisiona para que el gate no rechace de más.
  const disco = {
    ...discoFalso([
      'platforms/angular/apps/elements/primitives/badge/src/main.ts',
      'platforms/angular/apps/elements/modules/hero/src/main.ts',
      'platforms/react/apps/elements/primitives/badge/src/main.tsx',
    ]),
    plataformas: DOS_PLATAFORMAS,
  };

  it('EL CASO: sin declarar se rechaza nombrando LAS DOS rutas, no se elige una', () => {
    // El censo va EXPLÍCITAMENTE vacío. Antes se omitía y se usaba el de
    // verdad, que estaba vacío — así que el día que el censo tuvo su primera
    // entrada (`badge`, #64) este test pasó a probar el caso contrario del que
    // dice probar, y se puso rojo. Un fixture que depende de que una constante
    // del repo siga vacía es la regla 7 con el sujeto fuera del fichero.
    const errores = revisarFuentesDuplicadas(disco, {});

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('badge');
    // Las dos, con su framework y su ruta. Nombrar una sola es lo que hacía el
    // `Map`, y el precio era que el error salía en otro fichero.
    expect(errores[0]).toContain('angular (platforms/angular/apps/elements/primitives/badge)');
    expect(errores[0]).toContain('react (platforms/react/apps/elements/primitives/badge)');
    // Y no culpa al registry, que es lo que el mensaje viejo hacía.
    expect(errores[0]).not.toMatch(/declara framework/);
  });

  it('DECLARADO como escaparate, se acepta — y es la decisión, no una excepción', () => {
    // «Sí podría existir, pero no deberíamos tener esas cosas así»: se habilita
    // porque la épica #37 no se contesta sin el mismo elemento en dos
    // plataformas, y se declara uno por uno porque no es la forma normal.
    expect(revisarFuentesDuplicadas(disco, { badge: { razon: 'el escaparate de #37' } }))
      .toEqual([]);
  });

  it('…y en el OTRO sentido: una declaración que ya no aplica rompe', () => {
    // Una excepción que sobra deja de leerse, y la siguiente que entre lo hará
    // sin discusión. Es la misma regla que SIN_FUENTE_PROPIA.
    const errores = revisarFuentesDuplicadas(disco, {
      badge: { razon: 'el escaparate de #37' },
      hero: { razon: 'esto ya no es cierto' },
    });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('declara "hero" y no tiene fuente en más de una');
  });

  it('el censo de verdad tiene la entrada de #64, y cada una lleva su razón escrita', () => {
    // Estaba VACÍO hasta esta HU, y ese era el estado correcto mientras hubiera
    // una sola plataforma construible. La primera entrada la escribe #64 junto
    // con el elemento, que es la mitad del diseño: el coste de declarar un
    // escaparate lo paga quien lo crea y no quien lo hereda (regla 27).
    expect(Object.keys(SHOWCASE_MULTIPLATAFORMA)).toEqual(['badge']);

    for (const [nombre, entrada] of Object.entries(SHOWCASE_MULTIPLATAFORMA)) {
      // Una razón de dos palabras no es una razón: tiene que decir POR QUÉ
      // existe y CUÁNDO se retira, o la excepción deja de leerse.
      expect(entrada.razon, `${nombre} sin razón`).toBeTypeOf('string');
      expect(entrada.razon.length, `${nombre}: la razón es demasiado corta`).toBeGreaterThan(80);
    }
  });

  it('…y cada entrada del censo está DE VERDAD duplicada en el disco', () => {
    // El otro sentido, que es el que evita el muro de excepciones muertas: una
    // entrada sobre algo que ya no está en dos plataformas rompe el build.
    for (const nombre of Object.keys(SHOWCASE_MULTIPLATAFORMA)) {
      const plataformas = implementacionesDe(nombre, { ...discoReal, plataformas: PLATAFORMAS });
      expect(plataformas.length, `${nombre} declarado como escaparate y no está duplicado`)
        .toBeGreaterThan(1);
    }
  });

  it('implementacionesDe dice en qué plataformas vive, para quien publica', () => {
    expect(implementacionesDe('badge', disco)).toEqual(['angular', 'react']);
    expect(implementacionesDe('hero', disco)).toEqual(['angular']);
    expect(implementacionesDe('no-existe', disco)).toEqual([]);
  });

  it('el recorrido crudo NO colapsa: ve las tres fuentes', () => {
    // Es lo que `descubrirFuentes` no podía decir. Sin esto, el gate de arriba
    // tendría que recorrer por su cuenta y habría dos copias de la regla de qué
    // cuenta como fuente.
    expect(todasLasFuentes(disco).map((f) => `${f.framework}/${f.nombre}`).sort()).toEqual([
      'angular/badge',
      'angular/hero',
      'react/badge',
    ]);
  });

  it('el Map se queda con la PRIMERA, no con la última', () => {
    // Antes ganaba la última del bucle, así que el mismo árbol daba resultados
    // distintos según el orden de PLATAFORMAS — y eso convierte un fallo en algo
    // que «a veces pasa». Sólo importa en el camino de error: la colisión ya la
    // rechaza el gate de arriba.
    expect(descubrirFuentes(disco).get('badge').framework).toBe('angular');
  });

  it('un elemento en UNA sola plataforma no da rojo', () => {
    // La otra mitad, y la que impide que el gate rechace de más: `hero` existe
    // sólo en angular y eso es el caso normal.
    expect(revisarFuentesDuplicadas(disco, {}).some((e) => e.includes('hero'))).toBe(false);
  });

  it('y el disco de VERDAD no tiene ninguna duplicada', () => {
    expect(revisarFuentesDuplicadas({ ...discoReal, plataformas: PLATAFORMAS })).toEqual([]);
  });
});

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

    // Plural incluso con una: así quien publica no tiene dos formas que
    // distinguir. `publish.mjs` ya iteraba sobre una lista de uno (#59).
    expect(r.plataformas.map((p) => p.name)).toEqual(['angular']);
  });

  it('un framework que ninguna plataforma publica se para, en vez de quedar en "not built"', () => {
    const r = elegirPlataforma({ name: 'hero', framework: 'react' }, plataformas, conBundles());

    expect(r.error).toContain('ninguna plataforma lo publica');
    expect(r.plataformas).toBeUndefined();
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
    // Y dice la salida, que desde #59 son DOS y no una: separarlos en dos
    // elementos —lo normal— o declararlo escaparate.
    expect(r.error).toContain('SHOWCASE_MULTIPLATAFORMA');
  });

  it('…SALVO que esté declarado como escaparate: entonces se publican las DOS', () => {
    // La decisión de #59: puede existir, y no es la forma normal de escribir un
    // elemento — por eso va declarado uno por uno y no por convención. El
    // experimento de la épica es el MISMO badge en dos plataformas, midiendo
    // los dos pisos de peso.
    const r = elegirPlataforma(
      { name: 'badge', framework: 'angular' },
      plataformas,
      conBundles('dist/angular/badge/main.js', 'dist/svelte/badge/main.js'),
      { badge: { razon: 'el escaparate de la épica #37' } },
    );

    expect(r.error).toBeUndefined();
    // En el orden de PLATAFORMAS, no en el del descubrimiento: el publicador
    // escribe un slot por framework y el informe tiene que leerse igual en dos
    // máquinas.
    expect(r.plataformas.map((p) => p.name)).toEqual(['angular', 'svelte']);
  });

  it('un escaparate declarado con bundle en UNA sola sigue devolviendo una', () => {
    // La declaración habilita, no obliga: mientras la segunda plataforma no
    // haya construido, no hay nada que publicar por ahí.
    const r = elegirPlataforma(
      { name: 'badge', framework: 'angular' },
      plataformas,
      conBundles('dist/angular/badge/main.js'),
      { badge: { razon: 'el escaparate de la épica #37' } },
    );

    expect(r.plataformas.map((p) => p.name)).toEqual(['angular']);
  });
});

describe('resolverTier', () => {
  /**
   * El tier ya no se adivina (issue #43).
   *
   * El defecto que estos tests reproducen: `cms-sync` le ponía `composition` a
   * lo que no conocía y **sobreescribía el del registry**, lo que le baja a un
   * `module` el techo del presupuesto de 72 KB a 44 KB en silencio.
   *
   * EL FIXTURE TIENE QUE EXIGIR LA REGLA. Con un elemento cuyo tier ya está en
   * el registry, adivinar y leer dan el mismo resultado y el defecto pasa en
   * verde: por eso el caso que importa es el que NO está en ninguna de las dos
   * fuentes, que es exactamente el que antes salía `composition`.
   */
  const registroCon = (...entradas) => new Map(entradas.map((e) => [e.alias, e]));

  it('el registry manda cuando la entrada ya existe', () => {
    const r = resolverTier(
      { alias: 'elementSynStorefront', name: 'storefront' },
      registroCon({ alias: 'elementSynStorefront', tier: 'module' }),
      descubrirFuentes(discoFalso([])),
    );

    expect(r).toEqual({ tier: 'module', origen: 'registry' });
  });

  it('sin entrada en el registry, lo dice la carpeta donde vive la fuente', () => {
    const r = resolverTier(
      { alias: 'elementSynDataGrid', name: 'data-grid' },
      registroCon(),
      descubrirFuentes(discoFalso([`${APPS}/elements/modules/data-grid/src/main.ts`])),
    );

    expect(r).toEqual({ tier: 'module', origen: 'carpeta de la fuente' });
  });

  it('sin registry y sin fuente NO sale "composition": sale un error', () => {
    // EL defecto, escrito como test. Antes esto devolvía `composition` con un
    // WARN que nadie leía, y de paso se lo escribía al registry.
    const r = resolverTier(
      { alias: 'elementSynLoQueSea', name: 'lo-que-sea' },
      registroCon(),
      descubrirFuentes(discoFalso([])),
    );

    expect(r.tier).toBeUndefined();
    expect(r.error).toContain('nadie sabe su tier');
    expect(r.error).not.toMatch(/^composition/u);
  });

  it('registry y disco en desacuerdo no se resuelve eligiendo uno', () => {
    // La fuente se movió de carpeta, o el registry quedó viejo. Las dos
    // merecen que alguien mire; elegir una en silencio es cómo se degradó un
    // module a composition la primera vez.
    const r = resolverTier(
      { alias: 'elementSynX', name: 'x' },
      registroCon({ alias: 'elementSynX', tier: 'module' }),
      descubrirFuentes(discoFalso([`${APPS}/elements/compositions/x/src/main.ts`])),
    );

    expect(r.error).toContain('el registry dice tier "module"');
    expect(r.error).toContain('composition');
  });

  it('las 132 entradas de verdad resuelven a su propio tier, y ninguna falla', () => {
    const registro = loadRegistry();
    const porAlias = new Map(registro.map((e) => [e.alias, e]));
    const fuentes = descubrirFuentes({ ...discoReal, plataformas: PLATAFORMAS });

    const malas = registro
      .map((e) => ({ name: e.name, esperado: e.tier, r: resolverTier(e, porAlias, fuentes) }))
      .filter((x) => x.r.error || x.r.tier !== x.esperado);

    expect(malas).toEqual([]);
  });
});
