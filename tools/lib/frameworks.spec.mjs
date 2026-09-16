import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  frameworksConstruibles,
  revisarPlataformas,
  recorrerPublicado,
  frameworksDelRegistry,
} from './frameworks.mjs';
import { PLATFORMS, ALL_FRAMEWORKS, ROOT } from './synergos-config.mjs';

/**
 * Que el pipeline deje de cablear `angular` (issue #44).
 *
 * De los dos gates que este ticket arregla, el del tamaño es el que más duele y
 * el que menos se ve: pedía `<elemento>/angular/latest/main.js` y hacía
 * `if (!existsSync(bundle)) continue;`. Un bundle de React no es que se pasara
 * del techo — es que **nadie lo medía**, y el gate salía verde sobre los de
 * Angular.
 *
 *   > Un gate que apunta al sitio equivocado se lee como cobertura. Es la
 *   > misma figura de `cdn-smoke` (#9), y es la razón por la que esta HU va
 *   > ANTES del wrapper de React (#37): parametrizar después significa que el
 *   > segundo framework existe un rato sin presupuesto ni humo.
 */

// ── Dobles de disco ──────────────────────────────────────────────────────────
//
// El árbol se describe como un conjunto de rutas y el doble contesta sobre él.
// Es lo que permite montar un CDN con dos frameworks sin que exista el segundo.
function discoDe(rutas) {
  const todas = new Set(rutas);
  const listarDirs = (dir) => {
    const hijos = new Set();
    for (const r of todas) {
      if (!r.startsWith(`${dir}/`)) continue;
      const resto = r.slice(dir.length + 1);
      const [primero, ...cola] = resto.split('/');
      if (cola.length > 0) hijos.add(primero); // sólo es directorio si tiene algo debajo
    }
    return [...hijos];
  };
  return { listarDirs, existe: (r) => todas.has(r), unir: (...p) => p.join('/') };
}

describe('frameworksConstruibles', () => {
  it('una carpeta bajo platforms/ con package.json es una plataforma', () => {
    const io = discoDe([
      'r/platforms/angular/package.json',
      'r/platforms/react/package.json',
      'r/platforms/angular/apps/badge/src/main.ts',
    ]);
    expect(frameworksConstruibles({ raiz: 'r', ...io })).toEqual(['angular', 'react']);
  });

  it('una carpeta SIN package.json no lo es — no se puede construir', () => {
    // Es lo que distingue una plataforma de una carpeta que alguien dejó ahí.
    const io = discoDe([
      'r/platforms/angular/package.json',
      'r/platforms/notas/LEEME.md',
    ]);
    expect(frameworksConstruibles({ raiz: 'r', ...io })).toEqual(['angular']);
  });

  it('sin ninguna plataforma devuelve vacío, NO "angular"', () => {
    // La decisión que el ticket pide en voz alta: nunca un default silencioso.
    // Quien la consume decide qué hacer con el vacío — los dos gates se paran.
    expect(frameworksConstruibles({ raiz: 'r', ...discoDe([]) })).toEqual([]);
  });
});

describe('revisarPlataformas', () => {
  it('cuadran y no dice nada', () => {
    expect(revisarPlataformas(['angular'], ['angular'])).toEqual([]);
  });

  it('una carpeta que PLATFORMS no declara: el pipeline entero la ignoraría', () => {
    const [error] = revisarPlataformas(['angular', 'react'], ['angular']);
    expect(error).toContain('platforms/react/');
    expect(error).toContain('PLATFORMS');
  });

  it('una entrada de PLATFORMS sin carpeta: se publicaría lo que nadie construye', () => {
    const [error] = revisarPlataformas(['angular'], ['angular', 'svelte']);
    expect(error).toContain('svelte');
  });
});

describe('el disco y PLATFORMS dicen lo mismo — sobre el repo de verdad', () => {
  // Con dobles se prueba la regla; acá se prueba el REPO. Es lo que hace que
  // `platforms/react/` recién creado rompa el build en vez de existir sin que
  // ningún gate lo mire.
  const listarDirs = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [];

  const enDisco = frameworksConstruibles({ raiz: ROOT, listarDirs, existe: existsSync, unir: join });

  it('hay al menos una plataforma', () => {
    // Una lista vacía haría pasar todo lo de abajo sin mirar nada: es el modo
    // de fallo silencioso de un gate que deriva del disco.
    expect(enDisco.length).toBeGreaterThan(0);
  });

  it('las dos listas nombran a los mismos', () => {
    expect(revisarPlataformas(enDisco, PLATFORMS.map((p) => p.name))).toEqual([]);
    expect([...ALL_FRAMEWORKS].sort()).toEqual(enDisco);
  });
});

describe('recorrerPublicado', () => {
  const cdnCon = (rutas) => discoDe(rutas.map((r) => `cdn/${r}`));

  it('encuentra el bundle de CADA framework, no sólo el de angular', () => {
    // ÉSTE es el defecto del ticket. Antes se preguntaba por la ruta de Angular
    // y el resto ni se contaba.
    const io = cdnCon([
      'badge/angular/latest/main.js',
      'badge/react/latest/main.js',
      'runtime/angular/latest/import-map.json',
    ]);
    const { bundles, frameworks, errores } = recorrerPublicado({
      raizCdn: 'cdn',
      construibles: ['angular', 'react'],
      ...io,
    });
    expect(errores).toEqual([]);
    expect(frameworks).toEqual(['angular', 'react']);
    expect(bundles.map((b) => `${b.elemento}/${b.framework}`)).toEqual(['badge/angular', 'badge/react']);
  });

  it('`runtime/` no es un elemento y no se mide', () => {
    const io = cdnCon(['badge/angular/latest/main.js', 'runtime/angular/21.1.6/ng-core.js']);
    const { bundles, errores } = recorrerPublicado({ raizCdn: 'cdn', construibles: ['angular'], ...io });
    expect(errores).toEqual([]);
    expect(bundles).toHaveLength(1);
  });

  it('un elemento SIN ningún bundle falla — antes lo saltaba un `continue`', () => {
    // Una carpeta de elemento vacía en el CDN es un publish a medias: 404 en la
    // cara del visitante, y el gate contando un elemento menos sin decirlo.
    const io = cdnCon(['badge/angular/latest/main.js', 'card/angular/latest/meta.json']);
    const { errores } = recorrerPublicado({ raizCdn: 'cdn', construibles: ['angular'], ...io });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('card');
    expect(errores[0]).toContain('publish a medias');
  });

  it('un framework publicado que nadie construye falla, y se NOMBRA', () => {
    const io = cdnCon(['badge/angular/latest/main.js', 'badge/svelte/latest/main.js']);
    const { errores } = recorrerPublicado({ raizCdn: 'cdn', construibles: ['angular'], ...io });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('svelte');
    expect(errores[0]).toContain('huérfano');
  });

  it('un CDN vacío no da bundles ni inventa frameworks', () => {
    const { bundles, frameworks, errores } = recorrerPublicado({
      raizCdn: 'cdn',
      construibles: ['angular'],
      ...cdnCon([]),
    });
    expect(bundles).toEqual([]);
    expect(frameworks).toEqual([]);
    expect(errores).toEqual([]);
  });
});

describe('frameworksDelRegistry', () => {
  it('sale de las implementaciones declaradas, no de una lista', () => {
    const r = {
      elements: [
        { name: 'badge', implementations: { angular: { latest: '0.1.0' } } },
        { name: 'card', implementations: { react: { latest: '2.0.0' }, angular: { latest: '0.1.0' } } },
      ],
    };
    expect(frameworksDelRegistry(r)).toEqual(['angular', 'react']);
  });

  it('una implementación sin `latest` no cuenta: no hay nada que pedir', () => {
    const r = { elements: [{ name: 'x', implementations: { react: {} } }] };
    expect(frameworksDelRegistry(r)).toEqual([]);
  });

  it('un registry vacío da lista vacía, NO `["angular"]`', () => {
    expect(frameworksDelRegistry({ elements: [] })).toEqual([]);
    expect(frameworksDelRegistry(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL CENSO: qué herramienta puede nombrar al framework y cuál no.
//
// Sin esto, el arreglo dura hasta el siguiente que escriba
// `join(CDN, nombre, 'angular', …)` por reflejo, y nadie lo nota — porque el
// síntoma no es rojo, es verde sobre el sitio equivocado.
//
// La lista va EN LOS DOS SENTIDOS contra el disco: una herramienta nueva de
// `tools/` no puede nacer sin estar clasificada, y una clasificada que ya no
// existe rompe el build, porque una excepción que sobra deja de leerse. Es el
// mismo trámite que `SIN_FUENTE_PROPIA` en `element-sources.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las que trabajan sobre LO PUBLICADO, sea de quien sea. Ninguna puede nombrar
 * a un framework: su respuesta tiene que valer igual con uno o con cuatro.
 */
const CIEGAS_AL_FRAMEWORK = [
  'lib/rutas-hermanas.mjs',
  // Estaba en ESPECIFICAS_DE_ANGULAR —«publica al slot runtime/angular/<version>/»—
  // y era cierto mientras hubiera una plataforma. Con dos, publicaba el runtime de
  // Angular y nada más, informando «Done», y los elementos de la otra quedaban sin
  // de dónde resolver sus bare imports. Desde #64 RECORRE `dist/runtime/` y pide la
  // tabla por framework. Es la misma caducidad que `cdn-runtime-check` tuvo en #61:
  // una excepción del censo no es una lista de las malas, es una con fecha.
  'publish-runtime.mjs',
  // Deriva los sitios a instalar de `frameworksConstruibles` (#70). El `setup`
  // anterior era `npm install --prefix platforms/angular` a mano y por eso olvidó
  // `preact` el día que #64 lo creó: la regla 25 en el camino de entrada.
  'lib/setup-completo.mjs',
  'setup.mjs',
  // Cruza por NOMBRE DE FUNCIÓN y recorre todo `.ts` del repo (#63): no
  // pregunta por la ruta de ninguna plataforma, así que una copia puesta en
  // `platforms/react/libs/shared/` la caza igual que una en Angular.
  'lib/normalizador-unico.mjs',
  // Dejó de nombrarlo en #52: el descubrimiento es el del build y el menú de
  // framework se deriva de `frameworksConstruibles`. Antes la lista estaba
  // escrita a mano —`[{ name: 'Angular' }]`— y el rótulo del runtime decía
  // «Angular shared».
  'lib/interactive.mjs',
  // Recibe el framework y compone la ruta. Lo nombra en su cabecera —para
  // explicar por qué la obligación 6 no tiene mitad estática— y eso es prosa,
  // que el censo quita antes de mirar (#62).
  'lib/platform-contract.mjs',
  // Dejó de ser «legítimamente de Angular» en #61: la excepción valía mientras
  // hubiera UNA plataforma, y con dos publicar elementos de React sin su runtime
  // pasaba en verde. Hoy recorre lo publicado y le exige runtime a cada uno.
  'lib/cdn-runtime-check.mjs',
  'check-size-budget.mjs',
  'humo-cdn.mjs',
  'catalog.mjs',
  'clean-dist.mjs',
  'publish.mjs',
  'manifest-gen.mjs',
  'build-vitals.mjs',
  'contracts-export.mjs',
  'audit-themes.mjs',
  'dev-cdn.mjs',
  'lib/dev-cdn-routes.mjs',
  'lib/cdn-smoke.mjs',
  'lib/frameworks.mjs',
  'lib/banco-de-pruebas.mjs',
  'lib/indice-publicado.mjs',
  'lib/cdn-registry.mjs',
  'lib/cdn-cache-policy.mjs',
  'lib/manifest-builder.mjs',
  'lib/contract-schema.mjs',
  'lib/cli-utils.mjs',
  'lib/livereload.mjs',
  'lib/css-parity.mjs',
  'lib/cms-contract-rules.mjs',
  'lib/vitals-purity.mjs',
];

/**
 * Las que SÍ nombran a Angular, con la razón. Entrar exige escribirla.
 *
 * Son de tres clases y conviene distinguirlas, porque sólo una es deuda:
 *
 *   a) **herramientas DE Angular** — construyen o publican el runtime de
 *      Angular, o miden su `libs/shared`. Un segundo framework traerá las
 *      suyas; parametrizar éstas sería inventarle una forma a un runtime que
 *      no existe (§6, «no introducir abstracciones prematuras»).
 *   b) **el nombre del paquete** — `@angular/core` y compañía son
 *      especificadores de npm, no segmentos de ruta. El detector ya los quita,
 *      y aun así alguna aparece en prosa de un mensaje de error.
 *   c) **alias históricos** — `angular-host`, `elementIntAngularHost`: nombres
 *      del CMS que sobreviven por compatibilidad.
 */
const ESPECIFICAS_DE_ANGULAR = {
  'build-runtime.mjs':
    '(a) construye EL runtime de Angular: pasa el linker sobre los @angular/* de npm. ' +
    'Otro framework traerá su propia herramienta, con su propio linker o ninguno.',
  'build-cdn.mjs':
    '(a) orquesta el build llamando a `npm run build:angular` y al runtime de Angular. ' +
    'Su razón decía «el día que haya dos, itera sobre PLATFORMS» y ESE DÍA LLEGÓ (#64): ' +
    'hoy nombra a Angular porque todavía no itera, y eso es deuda medida y no una ' +
    'excepción legítima. Lo que la tapa mientras tanto es que `publish-runtime` sí ' +
    'recorre, así que un runtime construido a mano se publica igual.',
  'medir-frontera-shared.mjs':
    '(a) mide cuánto de platforms/angular/libs/shared está acoplado a la API de Angular. ' +
    'Su sujeto ES Angular; sin Angular la medición no significa nada.',
  'release-cdn.mjs':
    '(a) el framework ya NO tiene default (issue #44): lo exige. Lo que queda nombrando a ' +
    'Angular es `build-runtime.mjs`, cuyo linker es suyo, y la orquestación de `build-cdn`.',
  'cli.mjs':
    '(a) atajos de consola que lanzan los scripts de platforms/angular.',
  'cms-sync.mjs':
    '(a) escribe la ruta donde HABRÍA que crear un Web Component que falta. Es una pista ' +
    'para una persona, no una ruta de CDN.',
  'element-contract-audit.mjs':
    '(c) `elementIntAngularHost` y `angular-host` son alias históricos del CMS. El recorrido ' +
    'del disco ya NO nombra al framework: lo delega en element-sources.mjs (#44).',
  'validate-cms-contracts.mjs':
    '(c) `angular-host` es un alias deprecado del CMS que sigue llegando en payloads viejos.',
  'refresh-skill-catalog.mjs':
    '(b/c) prosa del catálogo de skills: nombra `release:angular` y dice cuál es hoy la única ' +
    'plataforma. Es documentación generada, no una ruta.',
  'lib/synergos-config.mjs':
    '(a) es DONDE vive la declaración de PLATFORMS. Que nombre a Angular es su trabajo; que lo ' +
    'nombre cualquier otro sitio es el defecto.',
  'lib/element-sources.mjs':
    '(a) `SIN_FUENTE_PROPIA` declara el framework de las dos entradas que ninguna plataforma ' +
    'construye, cada una con su razón escrita (issue #42).',
  'lib/cdn-size-budget.mjs':
    '(b) `@angular/core`, `@angular/elements` y `@angular/platform-browser` son los externals ' +
    'universales, y un mensaje de error apunta a platforms/angular/cdn.config.mjs.',
  'lib/mapa-del-runtime.mjs':
    '(a) es DONDE vive la tabla del import map del runtime de Angular y el censo de sus alias ' +
    'heredados. Que nombre a Angular es su trabajo — `ALIAS_HEREDADOS` declara quién es el ' +
    'dueño de `@synergos/core`, y sin ese dato el gate no puede decir quién lo está usurpando ' +
    '(#58). Lo que NO cablea el framework es el GATE: `recorrerMapasPublicados` RECORRE ' +
    '`runtime/*/` y `revisarMapas` deriva los nombres calificados con `calificar()`.',
  'lib/shell-cta-tokens.mjs':
    '(a) lee los shells de platforms/angular/libs para comprobar sus tokens de CTA (#25).',
};

/**
 * Las menciones de `angular` que cuentan.
 *
 * Se quitan los comentarios —un gate que se engaña con su propia explicación es
 * lo que ya pasó en el repo hermano— y los especificadores `@angular/…`, que
 * son nombres de paquete de npm y no segmentos de la ruta del CDN.
 */
function mencionesDeFramework(fuente) {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/@angular\/[a-z0-9/-]*/gi, '')
    .split('\n')
    .filter((l) => /angular/i.test(l))
    .map((l) => l.trim());
}

describe('el censo de `angular` en tools/', () => {
  const TOOLS = resolve(ROOT, 'tools');
  const ficheros = [
    ...readdirSync(TOOLS).filter((f) => f.endsWith('.mjs')),
    ...readdirSync(join(TOOLS, 'lib'))
      .filter((f) => f.endsWith('.mjs') && !f.endsWith('.spec.mjs'))
      .map((f) => `lib/${f}`),
  ].sort();

  it('hay herramientas que censar', () => {
    // Red de seguridad: si el descubrimiento deja de ver, todo lo de abajo
    // pasaría en verde sin mirar nada.
    expect(ficheros.length).toBeGreaterThan(20);
  });

  it('cada herramienta está clasificada, y en UNA sola lista', () => {
    const ciegas = new Set(CIEGAS_AL_FRAMEWORK);
    const especificas = new Set(Object.keys(ESPECIFICAS_DE_ANGULAR));

    const sinClasificar = ficheros.filter((f) => !ciegas.has(f) && !especificas.has(f));
    expect(sinClasificar, 'herramientas nuevas sin clasificar en frameworks.spec.mjs').toEqual([]);

    const enLasDos = ficheros.filter((f) => ciegas.has(f) && especificas.has(f));
    expect(enLasDos).toEqual([]);

    const fantasmas = [...ciegas, ...especificas].filter((f) => !ficheros.includes(f));
    expect(fantasmas, 'clasificadas que ya no existen — una excepción que sobra deja de leerse').toEqual([]);
  });

  it.each(CIEGAS_AL_FRAMEWORK)('%s no nombra a ningún framework', (relativo) => {
    // El gate de verdad. `check-size-budget.mjs` y `humo-cdn.mjs` están acá
    // porque son los dos que el ticket midió: el primero dejaba a React sin
    // techo, el segundo certificaba un despliegue habiendo mirado un segmento.
    const menciones = mencionesDeFramework(readFileSync(join(TOOLS, relativo), 'utf8'));
    expect(menciones, `${relativo} vuelve a cablear el framework`).toEqual([]);
  });

  it.each(Object.entries(ESPECIFICAS_DE_ANGULAR))('%s tiene razón escrita', (relativo, razon) => {
    expect(razon.length, `${relativo}: la razón tiene que decir algo`).toBeGreaterThan(40);
    // Y tiene que seguir nombrándolo: una excepción sobre un fichero que ya no
    // lo menciona sobra, y la siguiente que entre lo hará sin discusión.
    const menciones = mencionesDeFramework(readFileSync(join(TOOLS, relativo), 'utf8'));
    expect(menciones.length, `${relativo} ya no nombra a Angular: borrá la excepción`).toBeGreaterThan(0);
  });
});

/**
 * El segundo censo: las RUTAS de plataforma, y por qué la pregunta es otra (#60).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El censo de arriba filtra `!f.endsWith('.spec.mjs')` — y **los `.spec.mjs` son
 * justo los que recorren el disco**. Las `lib/*.mjs` son funciones puras con el
 * disco inyectado (por eso se pueden ver fallar), así que la ruta de verdad la
 * escribe el spec. Seis lo hacían, y **cinco llevan reglas neutrales**: CSS
 * muerto, un `it.skip` sin motivo, un helper del bridge sin consumidor, un shell
 * que nadie monta, una faceta multi-valor que viaja de a una. Ninguna de esas
 * cinco es de Angular; las cinco miraban sólo `platforms/angular/`.
 *
 * **Y el criterio NO puede ser el mismo.** Para una herramienta la pregunta es
 * «¿nombra un framework?». Para un spec, nombrarlo es NORMAL —`'angular'` y
 * `'react'` son datos de fixture, y medido, 18 de 21 specs lo nombran—, así que
 * ese criterio daría un muro de dieciocho excepciones, que es como se consigue
 * que un censo deje de leerse. Lo que hay que vigilar acá es **la RUTA
 * CABLEADA**: `platforms/<algo>` escrito a mano, que es exactamente el defecto
 * que §5.2(b) midió.
 *
 * Por eso son dos censos y no uno, y un fichero puede estar en los dos: no es
 * doble contabilidad, son dos preguntas distintas sobre el mismo fichero.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const RUTAS_DE_PLATAFORMA = {
  'lib/synergos-config.mjs':
    'Es DONDE vive PLATFORMS, con la ruta del dist de cada plataforma. Que escriba ' +
    'platforms/angular es su trabajo; que lo escriba cualquier otro sitio es el defecto.',
  'lib/cdn-size-budget.mjs':
    'Un mensaje de error apunta a platforms/angular/cdn.config.mjs, que es donde se declara ' +
    'la lista de externals. Es una pista para una persona, no una ruta que el gate recorra.',
  'lib/shell-cta-tokens.mjs':
    'Lee los shells de platforms/angular/libs para comprobar sus tokens de CTA (#25). Caduca ' +
    'el día que exista un segundo catálogo de shells — es la misma forma que cdn-runtime-check ' +
    'tenía antes de #61, y se arregla igual: recorriendo raicesDePlataformas.',
  'lib/element-sources.spec.mjs':
    'El fixture afirma dónde vive hoy la fuente de un elemento para que el descubrimiento no ' +
    'se desvíe en silencio. Es una aserción SOBRE el disco, no un recorrido cableado.',
  'lib/frameworks.spec.mjs':
    'Es el censo mismo. Sus fixtures nombran platforms/react y platforms/notas a propósito, ' +
    'para probar los dos sentidos de revisarPlataformas sin que exista ninguna de las dos.',
  'lib/normalizador-unico.spec.mjs':
    'La mutación que el ticket #63 nombra es literal: una segunda declaración de '
    + '`resolveConfigValue` en platforms/angular/libs/shared/src/utils/. El fixture la escribe '
    + 'tal cual para reproducirla. El GATE no la nombra —recorre todo `.ts` del repo— y hay un '
    + 'test que lo exige (`el barrido llega a los dos árboles`), que es lo que impide que esta '
    + 'excepción tape una constante de verdad.',
  'lib/vitals-purity.spec.mjs':
    'El caso feo del gate es una FUGA RELATIVA desde vitals/ hacia un componente de Angular ' +
    '(#36): la ruta ES el defecto que se reproduce, así que tiene que estar escrita.',
  'lib/platform-contract.spec.mjs':
    'Los fixtures montan una `platforms/react/` a medias para ver el contrato rechazar pieza por ' +
    'pieza (#62). La ruta ES el caso que se reproduce, igual que la fuga relativa de ' +
    'vitals-purity: escribirla es el punto.',
  'lib/setup-completo.spec.mjs':
    'Los fixtures montan platforms/angular, /preact y una /react que no existe para probar que ' +
    'el descubrimiento las encuentra SOLO — y una platforms/svelte sin package.json, que no es ' +
    'una plataforma. Los nombres SON el caso. El gate y tools/setup.mjs no nombran ninguna, y ' +
    'hay dos tests que lo exigen sobre la fuente de verdad (#70).',
  'lib/template-bindings.spec.mjs':
    'La ÚNICA de las seis cuya regla es de Angular: `[algo]="… || null"` es property binding ' +
    'de la sintaxis de plantillas de Angular, y un `[x]="y || null"` no significa nada en JSX. ' +
    'El día que haya un gate equivalente para otra sintaxis será otro fichero, no éste.',
};

describe('el censo de RUTAS de plataforma en tools/lib (#60)', () => {
  const LIB = resolve(ROOT, 'tools/lib');
  const ficheros = readdirSync(LIB)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `lib/${f}`)
    .sort();

  /**
   * `platforms/<framework>` fuera de los comentarios. La prosa puede nombrarlo.
   *
   * **El corte tuvo que afilarse al primer uso**, que es para lo que sirve tener
   * el caso feo del repo delante y no el bonito. La primera versión era
   * `platforms[/'"`,\s]+([a-z]…)`, y eso casa con
   * `unir(raiz, 'platforms', framework)` capturando **el nombre de la
   * variable** — o sea marcaba como cableada justamente la forma DERIVADA, que
   * es la que este censo existe para promover. Se vio al escribir
   * `platform-contract.mjs`, no leyendo el regex.
   *
   * Hoy sólo cuenta el literal: `platforms/angular` dentro de una cadena, o
   * `'platforms', 'angular'` como dos literales seguidos de `join`.
   */
  const rutasCableadas = (relativo) => {
    const src = readFileSync(resolve(ROOT, 'tools', relativo), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return [...new Set([
      ...[...src.matchAll(/platforms\/([a-z][a-z0-9-]*)/g)].map((m) => m[1]),
      ...[...src.matchAll(/['"`]platforms['"`]\s*,\s*['"`]([a-z][a-z0-9-]*)['"`]/g)].map((m) => m[1]),
    ])];
  };

  it('hay specs que censar, y son la mayoría', () => {
    // Red de seguridad doble: que el descubrimiento vea, y que vea los `.spec.mjs`
    // — que son justamente los que el censo de arriba no mira.
    expect(ficheros.length).toBeGreaterThan(30);
    expect(ficheros.filter((f) => f.endsWith('.spec.mjs')).length).toBeGreaterThan(15);
  });

  it('la forma DERIVADA no cuenta como cableada — el corte que costó afilar', () => {
    // `unir(raiz, 'platforms', framework)` es lo que este censo quiere que la
    // gente escriba, y la primera versión del regex lo marcaba como cableado
    // capturando el nombre de la variable. Un gate que rechaza la salida buena
    // enseña a desactivarlo.
    expect(rutasCableadas('lib/platform-contract.mjs')).toEqual([]);
    // Y el literal sigue contando, en las dos formas.
    expect(rutasCableadas('lib/synergos-config.mjs')).toContain('angular');
  });

  it('nadie cablea `platforms/<algo>` sin estar declarado', () => {
    const conRuta = ficheros.filter((f) => rutasCableadas(f).length > 0);
    const sinDeclarar = conRuta.filter((f) => !(f in RUTAS_DE_PLATAFORMA));

    expect(
      sinDeclarar,
      'cablea platforms/<framework> y no está en RUTAS_DE_PLATAFORMA. Si la regla es neutral, ' +
        'usá raicesEnDisco(REPO); si de verdad es de una plataforma, declaralo con su razón.',
    ).toEqual([]);
  });

  it('…y en los dos sentidos: una declaración que sobra rompe', () => {
    // La mitad que hace que el censo siga sirviendo. Una excepción sobre un
    // fichero que ya no cablea nada deja de leerse, y la siguiente que entre lo
    // hará sin discusión. Es lo que acaba de pasar con cdn-runtime-check (#61).
    const sobran = Object.keys(RUTAS_DE_PLATAFORMA).filter((f) => rutasCableadas(f).length === 0);
    expect(sobran, 'ya no cablea ninguna ruta de plataforma: borrá la declaración').toEqual([]);
  });

  it.each(Object.entries(RUTAS_DE_PLATAFORMA))('%s tiene razón escrita', (relativo, razon) => {
    expect(razon.length, `${relativo}: la razón tiene que decir algo`).toBeGreaterThan(60);
  });
});
