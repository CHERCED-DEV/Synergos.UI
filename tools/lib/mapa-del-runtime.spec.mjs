import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALIAS_HEREDADOS,
  ficherosDelRuntime,
  calificar,
  importsDelRuntimeAngular,
  importsDelRuntimePreact,
  recorrerMapasPublicados,
  revisarMapas,
} from './mapa-del-runtime.mjs';

const RAIZ = resolve(fileURLToPath(import.meta.url), '../../..');

/** Un mapa de mentira con la forma del de verdad. */
const mapa = (framework, imports) => ({ framework, imports });

/** Lo que Angular publica hoy, resuelto contra una base cualquiera. */
const angularHoy = (base = '/synergos/runtime/angular/21.1.6') =>
  mapa('angular', importsDelRuntimeAngular(base));

/** Y lo que publica Preact (#64), que es la segunda plataforma de verdad. */
const preactHoy = (base = '/synergos/runtime/preact/10.29.8') =>
  mapa('preact', importsDelRuntimePreact(base));

describe('el import map del runtime — la tabla', () => {
  it('publica el alias heredado y su gemelo calificado APUNTANDO AL MISMO fichero', () => {
    // La mitad que hace barata la salida: con la misma URL el composer del CMS
    // los deduplica en vez de pararse (`El_mismo_specifier_con_la_MISMA_url_no_es_conflicto`).
    const imports = importsDelRuntimeAngular('https://cdn/synergos/runtime/angular/21.1.6');
    expect(imports['@synergos/core']).toBe(imports['@synergos/angular-core']);
    expect(imports['@synergos/shared']).toBe(imports['@synergos/angular-shared']);
    expect(imports['@synergos/angular-core']).toMatch(/\/sg-core\.js$/);
  });

  it('el nombre calificado se DERIVA del framework, no se escribe', () => {
    // Una tabla `PAQUETES_POR_FRAMEWORK` a mano es la copia que #42 y #43 ya
    // pagaron dos veces: la unión de tipos fabrica el array de al lado.
    expect(calificar('@synergos/core', 'react')).toBe('@synergos/react-core');
    expect(calificar('@synergos/shared', 'svelte')).toBe('@synergos/svelte-shared');
  });

  it('todo alias del censo apunta a un fichero que el runtime construye de verdad', () => {
    // Sin esto, el censo podría nombrar un `sg-loquesea.js` que nadie publica y
    // el mapa saldría apuntando a un 404 — con el gate en verde.
    // Se pide por el framework de CADA entrada del censo, no contra una lista
    // única. `FICHEROS_DEL_RUNTIME` era la de Angular a secas, así que con una
    // segunda plataforma esto habría medido el alias de una contra los ficheros
    // de la otra — verde o rojo por casualidad (#64).
    for (const { framework, fichero } of Object.values(ALIAS_HEREDADOS)) {
      expect(ficherosDelRuntime(framework), `${framework}: ${fichero}`).toContain(fichero);
    }
  });
});

describe('el import map del runtime — el gate', () => {
  it('acepta lo que se publica HOY', () => {
    expect(revisarMapas([angularHoy()])).toEqual([]);
  });

  it('MUTACIÓN 1 — dos frameworks se pelean el mismo specifier', () => {
    // El fixture del ticket, y el fixture del test que ya estaba VERDE en el
    // otro árbol (`ImportMapComposerTests`): angular y react declarando
    // `@synergos/core` con su propia URL. El CMS devuelve `null` y la página no
    // emite ningún <script type="importmap">.
    const react = mapa('react', {
      '@synergos/core': '/synergos/runtime/react/1.0.0/sg-core.js',
      '@synergos/react-core': '/synergos/runtime/react/1.0.0/sg-core.js',
    });

    const errores = revisarMapas([angularHoy(), react]);
    const colision = errores.filter((e) => e.includes('URLs distintas'));

    expect(colision).toHaveLength(1);
    expect(colision[0]).toContain('"@synergos/core"');
    expect(colision[0]).toContain('angular →');
    expect(colision[0]).toContain('react →');
    // Y dice a dónde ir, que es lo que evita que el arreglo sea «quitá el gate».
    expect(colision[0]).toContain('@synergos/react-core');
  });

  it('…y con la MISMA URL no es conflicto: se deduplica', () => {
    // El caso legítimo, y el que EXIGE que el criterio sea por URL y no por
    // «dos frameworks nombran lo mismo». Sin este caso, el gate prohibiría
    // justo la salida que esta HU propone.
    // El mapa de angular es el COMPLETO —el que se publica hoy— y no uno
    // mínimo: con un fixture recortado saltan los dientes del censo y el test
    // deja de decir nada sobre la deduplicación, que es lo que viene a probar.
    const angular = angularHoy();
    const react = mapa('react', {
      // Misma URL a propósito: react reusando el rxjs que angular ya publica.
      'rxjs': angular.imports['rxjs'],
      '@synergos/react-core': '/synergos/runtime/react/1.0.0/sg-core.js',
    });

    expect(revisarMapas([angular, react])).toEqual([]);
  });

  it('MUTACIÓN 2 — un framework que no es el dueño declara el nombre agnóstico, SOLO', () => {
    // Rojo aunque no haya con quién colisionar todavía: el daño llega el día
    // que angular publique, y para entonces quien lo publicó ya se fue.
    const errores = revisarMapas([
      mapa('react', { '@synergos/core': '/synergos/runtime/react/1.0.0/sg-core.js' }),
    ]);

    expect(errores.some((e) => e.includes('specifier agnóstico "@synergos/core"'))).toBe(true);
    expect(errores.some((e) => e.includes('"@synergos/react-core"'))).toBe(true);
    // Y NO por colisión: en este árbol angular no publicó nada.
    expect(errores.some((e) => e.includes('URLs distintas'))).toBe(false);
  });

  it('el dueño no puede RETIRAR su alias heredado', () => {
    // `cdn.config.mjs` ya lo decía de los externals: los bundles publicados
    // siguen haciendo el bare import y el navegador se queda sin de dónde.
    const sinAlias = importsDelRuntimeAngular('/b');
    delete sinAlias['@synergos/core'];

    const errores = revisarMapas([mapa('angular', sinAlias)]);
    expect(errores.some((e) => e.includes('dejó de declarar "@synergos/core"'))).toBe(true);
  });

  it('…ni publicarlo SIN su gemelo calificado', () => {
    // El diente que hace que la migración exista: sin el gemelo, el alias
    // agnóstico se queda de única puerta y estamos donde estábamos.
    const sinGemelo = importsDelRuntimeAngular('/b');
    delete sinGemelo['@synergos/angular-core'];

    const errores = revisarMapas([mapa('angular', sinGemelo)]);
    expect(errores.some((e) => e.includes('no su gemelo "@synergos/angular-core"'))).toBe(true);
  });

  it('…y el gemelo con OTRA url tampoco vale', () => {
    // Apuntar a otro fichero es exactamente lo que el composer para: serían dos
    // specifiers distintos, sí, pero el alias dejaría de ser un alias.
    const desviado = importsDelRuntimeAngular('/b');
    desviado['@synergos/angular-core'] = '/otro/sg-core.js';

    expect(revisarMapas([mapa('angular', desviado)]).some((e) => e.includes('MISMA'))).toBe(true);
  });
});

describe('el import map del runtime — lo que hay en el disco', () => {
  const listarDirs = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [];
  const io = {
    listarDirs,
    existe: existsSync,
    leerJson: (r) => JSON.parse(readFileSync(r, 'utf8')),
    unir: join,
  };

  it('RECORRE los frameworks publicados en vez de preguntar por angular', () => {
    // El corte de la regla 25: preguntar por una ruta sólo confirma lo que ya
    // se suponía. Un fixture con dos plataformas lo demuestra sin CDN real.
    const arbol = {
      'cdn/runtime/angular/latest/import-map.json': { imports: { 'rxjs': '/a/rxjs.js' } },
      'cdn/runtime/svelte/latest/import-map.json': { imports: { 'svelte': '/s/svelte.js' } },
    };
    const falso = {
      listarDirs: (d) => (d === 'cdn/runtime' ? ['angular', 'svelte'] : []),
      existe: (r) => r === 'cdn/runtime' || Object.hasOwn(arbol, r),
      leerJson: (r) => arbol[r],
    };

    const { mapas, errores } = recorrerMapasPublicados({ raizCdn: 'cdn', ...falso });
    expect(errores).toEqual([]);
    expect(mapas.map((m) => m.framework)).toEqual(['angular', 'svelte']);
  });

  it('un runtime publicado SIN import-map.json se rechaza, no se salta', () => {
    // El `continue` que salta lo que no encuentra es el escondite de la regla
    // 25(c): sin mapa, el CMS no compone nada y NADA hidrata.
    const falso = {
      listarDirs: (d) => (d === 'cdn/runtime' ? ['react'] : []),
      existe: (r) => r === 'cdn/runtime',
      leerJson: () => { throw new Error('no debería leerse'); },
    };
    const { mapas, errores } = recorrerMapasPublicados({ raizCdn: 'cdn', ...falso });
    expect(mapas).toEqual([]);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('SIN import-map.json');
  });

  it('y lo que este repo tiene publicado en public/ cruza', () => {
    // La red de seguridad: si el recorrido dejara de ver, las listas saldrían
    // vacías y el cruce pasaría en verde sin mirar nada. Por eso se exige que
    // haya encontrado al menos un mapa.
    const raizCdn = join(RAIZ, 'public', 'synergos');
    if (!existsSync(join(raizCdn, 'runtime'))) return; // clon sin `npm run build:cdn`

    const { mapas, errores } = recorrerMapasPublicados({ raizCdn, ...io });
    expect(errores).toEqual([]);
    expect(mapas.length).toBeGreaterThan(0);
    expect(revisarMapas(mapas)).toEqual([]);
  });
});


describe('los DOS mapas que se publican de verdad (#64)', () => {
  // Hasta esta HU el gate se probaba con un `react` inventado. El fixture es
  // ahora lo que hay en el disco, que es la única forma de que un cambio en
  // cualquiera de las dos tablas se vea: un gate probado sólo contra un fixture
  // de mentira mide su fixture.

  it('EL CRUCE: los de Angular y Preact COMPONEN — sin esto no hidrata nada', () => {
    expect(revisarMapas([angularHoy(), preactHoy()])).toEqual([]);
  });

  it('Preact publica SÓLO nombres calificados — no arrastra bundles viejos', () => {
    const { imports } = preactHoy();
    const agnosticos = Object.keys(imports).filter(
      (k) => k.startsWith('@synergos/') && !k.startsWith('@synergos/preact-'),
    );
    expect(agnosticos, 'un @synergos agnóstico desde una plataforma nueva').toEqual([]);
  });

  it('LA MUTACIÓN que apaga el sitio: Preact publicando `@synergos/core`', () => {
    // Es lo que uno escribe por simetría con Angular, y es lo que el gate
    // existe para rechazar. Angular NO lo puede retirar —sus 127 bundles ya lo
    // importan— así que el conflicto sale sí o sí.
    const roto = mapa('preact', {
      ...preactHoy().imports,
      '@synergos/core': '/synergos/runtime/preact/10.29.8/sg-preact-core.js',
    });

    const errores = revisarMapas([angularHoy(), roto]);

    // Saltan DOS dientes, no uno, y esperaba uno: el del conflicto de URLs y el
    // del censo —una plataforma nueva declarando el alias agnóstico de otra—.
    // Que sean dos es mejor que uno: el primero dice qué pasa y el segundo dice
    // de quién es el nombre y por qué no se puede retirar. La aserción se
    // corrige al gate y no al revés.
    expect(errores).toHaveLength(2);

    const conflicto = errores.find((e) => e.includes('URLs distintas'));
    expect(conflicto).toContain('"@synergos/core"');
    expect(conflicto).toContain('no hidrata NADA');
    expect(conflicto).toContain('@synergos/preact-core');

    const censo = errores.find((e) => e.includes('specifier agnóstico'));
    expect(censo).toContain('que es de angular');
    expect(censo).toContain('@synergos/preact-core');
  });

  it('un specifier compartido con la MISMA url no es conflicto', () => {
    // El caso legítimo, y hace falta para que el gate no rechace de más: dos
    // frameworks pueden servir el mismo fichero. Si esto se pusiera rojo, la
    // salida barata de #58 —publicar los dos nombres a la misma url— dejaría de
    // existir.
    const compartido = '/synergos/comun/tslib.js';
    expect(
      revisarMapas([
        mapa('angular', { ...angularHoy().imports, tslib: compartido }),
        mapa('preact', { ...preactHoy().imports, tslib: compartido }),
      ]),
    ).toEqual([]);
  });

  it('cada fichero que el mapa de Preact nombra está en su tabla de ficheros', () => {
    // Las dos mitades —qué se copia y qué lo resuelve— se desalinean en
    // silencio: el mapa apuntaría a un 404 y el gate seguiría verde. Ya pasó
    // entre `build-runtime` y `publish-runtime` en #58.
    const declarados = ficherosDelRuntime('preact');
    for (const url of Object.values(preactHoy().imports)) {
      expect(declarados, url).toContain(url.split('/').at(-1));
    }
  });
});
