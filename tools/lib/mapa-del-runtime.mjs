/**
 * El import map del runtime: UNA tabla, y por qué el nombre lleva el framework
 * dentro (issue #58).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA, Y NO HAY QUE IMAGINARLO.
 *
 * El CMS compone UN import map juntando el de cada framework que el registry
 * declara (`ImportMapComposer.Componer`, CMS #127). Su regla es la correcta:
 * **el mismo specifier con URLs distintas no se resuelve, se PARA** — y sin
 * mapa, ningún `<synergos-*>` resuelve `@angular/core` y **nada hidrata**: 200,
 * el SSR entero en pantalla, todo lo interactivo muerto.
 *
 * Y lo que este repo publicaba hoy declaraba nombres AGNÓSTICOS con destinos
 * ESPECÍFICOS (medido contra el CDN vivo el 2026-09-15):
 *
 *     "@synergos/core":   "/synergos/runtime/angular/21.1.6/sg-core.js"
 *     "@synergos/shared": "/synergos/runtime/angular/21.1.6/sg-shared.js"
 *
 * O sea que una segunda plataforma haciendo lo obvio —publicar su `sg-core.js`
 * bajo el mismo nombre— apagaba el sitio ENTERO, Angular incluido, por un
 * `publish` de acá.
 *
 *   > **Lo que lo vuelve una regla y no una anécdota** es que el test que lo
 *   > prueba ya existía, VERDE, en el otro árbol, y su fixture es literalmente
 *   > este caso (`angular` y `react` peleándose `@synergos/core` en
 *   > `ImportMapComposerTests`). El CMS anticipó la colisión **como regla** y
 *   > nadie sacó la consecuencia, porque la consecuencia se escribe en el repo
 *   > de al lado. Es la regla 26 del `CLAUDE.md`: el gate del árbol que vigila
 *   > no protege al árbol que rompe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SALIDA, Y POR QUÉ ES BARATA.
 *
 * El propio composer da el criterio: **el mismo specifier con la MISMA URL no
 * es conflicto, se deduplica**. Así que Angular publica los DOS nombres
 * apuntando al mismo fichero, y toda plataforma nueva publica **sólo** el suyo
 * calificado. Coste: dos entradas más en un JSON generado.
 *
 * **El alias agnóstico NO se retira nunca mientras haya bundles publicados que
 * lo importen**, y `cdn.config.mjs` ya lo decía de la lista de externals:
 * *«quitar una entrada es peor: los elementos ya publicados siguen haciendo el
 * bare import y el navegador no tiene de dónde resolverlo»*. Por eso
 * `ALIAS_HEREDADOS` es un CENSO con su razón al lado, y el gate lo vigila en
 * los dos sentidos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y POR QUÉ LA TABLA VIVE ACÁ.
 *
 * Estaba escrita DOS veces —`buildImportMap` en `tools/build-runtime.mjs` y el
 * objeto `importMap` en `tools/publish-runtime.mjs`— con la lista de ficheros
 * duplicada por tercera y cuarta vez. Dos copias de la misma tabla es cómo se
 * publica el alias en una y no en la otra: el mapa de `dist/` y el mapa del CDN
 * diciendo cosas distintas sobre el MISMO runtime, sin que nada falle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO SE HACE AHORA, Y SU DISPARADOR.
 *
 * Los import maps del navegador tienen **`scopes`**, que resolverían esto en la
 * plataforma en vez de en el nombre. Es la respuesta *correcta* de la web y no
 * se toma ahora porque el tipo `ImportMap` del CMS lleva un solo campo
 * (`Imports`) y la vista serializa `new { imports = … }`: son cinco ficheros
 * del otro árbol por un beneficio que el prefijo compra con dos líneas.
 *
 * **Disparador para subir a `scopes`:** el día que dos frameworks necesiten el
 * MISMO specifier de un tercero con **versiones distintas** (dos `react` de
 * mayor distinta, un `rxjs` versionado). Ahí el prefijo deja de alcanzar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los ficheros que produce el build del runtime de Angular, en orden de publicación. */
export const FICHEROS_POR_FRAMEWORK = {
  angular: [
    'ng-core.js',
    'ng-rxjs-interop.js',
    'ng-primitives-di.js',
    'ng-primitives-signals.js',
    'ng-primitives-event-dispatch.js',
    'ng-compiler.js',
    'ng-common.js',
    'ng-common-http.js',
    'ng-elements.js',
    'ng-forms.js',
    'ng-platform-browser.js',
    'ng-router.js',
    'rxjs.js',
    'sg-core.js',
    'sg-shared.js',
  ],
  /**
   * Preact (#64). Son CINCO ficheros contra los quince de Angular, y esa
   * diferencia es la respuesta que la épica #37 estaba buscando — no una
   * simplificación de este fichero.
   */
  preact: [
    'preact.js',
    'preact-hooks.js',
    'preact-jsx-runtime.js',
    'sg-preact-core.js',
    'sg-preact-shared.js',
  ],
};

/**
 * Los ficheros del runtime de un framework.
 *
 * ⚠ Se pide POR FRAMEWORK y no hay default. `FICHEROS_DEL_RUNTIME` era una
 * lista a secas —la de Angular— y quien publicara una segunda plataforma
 * copiaría sus quince nombres sobre cinco ficheros que no existen; el publish
 * avisaría de catorce ausentes y nadie sabría si eso está bien. Es la regla 25:
 * una dimensión resuelta a una constante no falla, contesta sobre el sitio
 * equivocado.
 */
export function ficherosDelRuntime(framework) {
  const ficheros = FICHEROS_POR_FRAMEWORK[framework];
  if (!ficheros) {
    throw new Error(
      `No hay tabla de runtime para "${framework}". Declarala en FICHEROS_POR_FRAMEWORK ` +
        `(tools/lib/mapa-del-runtime.mjs) junto con sus imports — las dos mitades van juntas ` +
        `o el import map nombra ficheros que nadie publica.`,
    );
  }
  return ficheros;
}

/**
 * El censo de los specifiers AGNÓSTICOS que ya están publicados, con su dueño.
 *
 * No es una lista de nombres prohibidos: es la deuda medida. Cada entrada dice
 * quién la publica hoy, a qué fichero va y **por qué no se puede retirar**. El
 * día que ningún bundle publicado importe el nombre agnóstico, la entrada sobra
 * y hay que quitarla — una excepción que sobra deja de leerse (regla 23a).
 */
export const ALIAS_HEREDADOS = {
  '@synergos/core': {
    framework: 'angular',
    fichero: 'sg-core.js',
    razon:
      'Los 127 bundles ya publicados hacen `from "@synergos/core"`. Retirarlo deja al ' +
      'navegador sin de dónde resolverlo y los elementos no arrancan.',
  },
  '@synergos/shared': {
    framework: 'angular',
    fichero: 'sg-shared.js',
    razon:
      'Mismo caso que `@synergos/core`: está en EXTERNALS desde el primer publish, así que ' +
      'todo bundle en el CDN lo importa por nombre.',
  },
};

/**
 * El nombre calificado de un paquete `@synergos/*` para un framework.
 *
 *     calificar('@synergos/core', 'angular') → '@synergos/angular-core'
 *
 * Se deriva del framework en vez de escribirse: un `PAQUETES_POR_FRAMEWORK` a
 * mano es la copia que #42 y #43 ya pagaron dos veces.
 */
export function calificar(specifier, framework) {
  const nombre = specifier.replace(/^@synergos\//, '');
  return `@synergos/${framework}-${nombre}`;
}

/**
 * La tabla `imports` del runtime de Angular, con el alias heredado incluido.
 *
 * Los dos nombres apuntan **al mismo fichero** a propósito: es lo que hace que
 * el composer del CMS los deduplique en vez de pararse.
 *
 * @param {string} base URL base ya sin barra final (`…/runtime/angular/21.1.6`).
 * @returns {Record<string,string>} Ordenada por clave, para que el JSON no
 *   dependa del orden en que se escribió el fichero.
 */
export function importsDelRuntimeAngular(base) {
  const b = String(base).replace(/\/$/, '');
  const imports = {
    '@angular/core': `${b}/ng-core.js`,
    '@angular/core/rxjs-interop': `${b}/ng-rxjs-interop.js`,
    '@angular/core/primitives/di': `${b}/ng-primitives-di.js`,
    '@angular/core/primitives/signals': `${b}/ng-primitives-signals.js`,
    '@angular/core/primitives/event-dispatch': `${b}/ng-primitives-event-dispatch.js`,
    '@angular/compiler': `${b}/ng-compiler.js`,
    '@angular/common': `${b}/ng-common.js`,
    '@angular/common/http': `${b}/ng-common-http.js`,
    '@angular/elements': `${b}/ng-elements.js`,
    '@angular/forms': `${b}/ng-forms.js`,
    '@angular/platform-browser': `${b}/ng-platform-browser.js`,
    '@angular/router': `${b}/ng-router.js`,
    'rxjs': `${b}/rxjs.js`,
    'rxjs/operators': `${b}/rxjs.js`,
  };

  for (const [alias, { framework, fichero }] of Object.entries(ALIAS_HEREDADOS)) {
    if (framework !== 'angular') continue;
    imports[alias] = `${b}/${fichero}`;
    imports[calificar(alias, framework)] = `${b}/${fichero}`;
  }

  return imports;
}

/**
 * Los imports del runtime de Preact (#64).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODOS LOS `@synergos/*` VAN CALIFICADOS, Y ÉSA ES LA REGLA 26 EN UNA LÍNEA.
 *
 * Angular publica `@synergos/core` y `@synergos/shared` —nombres AGNÓSTICOS— y
 * NO puede retirarlos: sus 127 bundles ya publicados hacen ese bare import. Por
 * eso están en `ALIAS_HEREDADOS`, con su razón, y desde #58 publican además su
 * gemelo calificado a la MISMA url, que es lo que permite deduplicar.
 *
 * Una plataforma NUEVA no arrastra nada, así que publica **sólo** el calificado.
 * Si esto dijera `@synergos/core`, el CMS vería el mismo specifier con dos URLs
 * distintas, su compositor devolvería `null`, la vista no emitiría ningún
 * `<script type="importmap">` y **la página no hidrataría NADA, Angular
 * incluido** — el defecto CMS #126, provocado desde este repo por un `publish`.
 * El gate `mapa-del-runtime` lo rechaza antes de subir; esta nota está para que
 * nadie tenga que descubrirlo mutándolo.
 *
 * `preact/compat` NO se publica hoy. Sería el alias que hace que un paquete de
 * React funcione sobre Preact, y no hay ninguno: publicarlo sería declarar un
 * camino que nadie recorre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function importsDelRuntimePreact(base) {
  const b = String(base).replace(/\/$/, '');
  return {
    preact: `${b}/preact.js`,
    'preact/hooks': `${b}/preact-hooks.js`,
    'preact/jsx-runtime': `${b}/preact-jsx-runtime.js`,
    [calificar('@synergos/core', 'preact')]: `${b}/sg-preact-core.js`,
    [calificar('@synergos/shared', 'preact')]: `${b}/sg-preact-shared.js`,
  };
}

/** Por framework, sin default — la misma razón que `ficherosDelRuntime`. */
const IMPORTS_POR_FRAMEWORK = {
  angular: importsDelRuntimeAngular,
  preact: importsDelRuntimePreact,
};

/**
 * Los imports del runtime de un framework, sobre una base de URL.
 *
 * Las dos mitades —qué ficheros se copian y qué nombres los resuelven— se piden
 * por el MISMO framework a propósito: es lo que impide que el import map nombre
 * `sg-preact-shared.js` mientras el publish copia los quince de Angular.
 */
export function importsDelRuntime(framework, base) {
  const construir = IMPORTS_POR_FRAMEWORK[framework];
  if (!construir) {
    throw new Error(
      `No hay import map para "${framework}". Declaralo en IMPORTS_POR_FRAMEWORK ` +
        `(tools/lib/mapa-del-runtime.mjs) junto con sus ficheros.`,
    );
  }
  return construir(base);
}

// ── El gate ─────────────────────────────────────────────────────────────────

const unirPorDefecto = (...partes) => partes.join('/');

/** La carpeta del CDN donde vive el runtime de cada plataforma. */
export const CARPETA_RUNTIME = 'runtime';

/**
 * Los import maps que hay de verdad en un árbol de CDN, uno por framework.
 *
 * Se **recorre**, no se pregunta por `runtime/angular/…`. Es el corte de la
 * regla 25 y el mismo que `recorrerPublicado` hace con los bundles: preguntar
 * por una ruta sólo confirma lo que ya se suponía, y lo que hay que encontrar
 * acá es justamente el mapa de un framework que nadie escribió en ningún sitio.
 *
 * El disco se inyecta para poder ver fallar el gate sin montar un CDN de
 * mentira, como en `frameworks.mjs` y `cdn-runtime-check.mjs`.
 *
 * @returns {{ mapas: { framework: string, imports: Record<string,string>, ruta: string }[],
 *             errores: string[] }}
 */
export function recorrerMapasPublicados({ raizCdn, listarDirs, existe, leerJson, unir = unirPorDefecto }) {
  const base = unir(raizCdn, CARPETA_RUNTIME);
  const mapas = [];
  const errores = [];

  if (!existe(base)) return { mapas, errores };

  for (const framework of listarDirs(base).sort()) {
    const ruta = unir(base, framework, 'latest', 'import-map.json');
    if (!existe(ruta)) {
      errores.push(
        `runtime/${framework}/: publicado SIN import-map.json en latest/. Los elementos de ` +
          `esa plataforma no resuelven un solo bare import — y el CMS compone el mapa a ` +
          `partir de esto, así que lo que falta no deja un hueco: no hay mapa.`,
      );
      continue;
    }

    let mapa;
    try {
      mapa = leerJson(ruta);
    } catch (err) {
      errores.push(`runtime/${framework}/latest/import-map.json no es JSON legible: ${err.message}`);
      continue;
    }

    const imports = mapa?.imports;
    if (!imports || typeof imports !== 'object') {
      errores.push(
        `runtime/${framework}/latest/import-map.json no declara un objeto \`imports\`. ` +
          `Es la única clave que el CMS lee (\`ImportMap.Imports\`).`,
      );
      continue;
    }

    mapas.push({ framework, imports, ruta });
  }

  return { mapas, errores };
}

/**
 * Los cuatro dientes que impiden que un `publish` de acá apague el sitio.
 *
 * Es una función pura sobre los mapas ya leídos: lo que se quiere probar es el
 * CRITERIO, y montarle un disco alrededor para verlo fallar es lo que hace que
 * un gate no se pruebe nunca.
 *
 * @param {{ framework: string, imports: Record<string,string> }[]} mapas
 * @returns {string[]} Líneas de error. Vacío es que cuadra.
 */
export function revisarMapas(mapas) {
  const errores = [];

  // ── 1. El mismo specifier con URLs distintas. Es el sitio caído. ──────────
  //
  // Con la MISMA url no es conflicto y se deduplica: `rxjs` puede salir del
  // mismo sitio para dos frameworks, y de hecho es lo que hace barata la
  // salida de esta HU. Se cruza por PAR, para nombrar los dos culpables.
  const porSpecifier = new Map();
  for (const { framework, imports } of mapas) {
    for (const [specifier, url] of Object.entries(imports)) {
      if (!porSpecifier.has(specifier)) porSpecifier.set(specifier, []);
      porSpecifier.get(specifier).push({ framework, url });
    }
  }

  for (const [specifier, entradas] of [...porSpecifier].sort()) {
    const urls = [...new Set(entradas.map((e) => e.url))];
    if (urls.length < 2) continue;
    const detalle = entradas.map((e) => `${e.framework} → ${e.url}`).join('  |  ');
    errores.push(
      `"${specifier}" se publica con ${urls.length} URLs distintas (${detalle}). ` +
        `El CMS NO elige una: devuelve \`null\` y la página no emite ningún ` +
        `<script type="importmap">, así que no hidrata NADA — el framework que ya ` +
        `funcionaba incluido. Usá el nombre calificado (${entradas
          .map((e) => calificar(specifier, e.framework))
          .filter((n) => n !== specifier)
          .join(', ')}).`,
    );
  }

  // ── 2, 3 y 4. El censo de alias heredados, en los dos sentidos. ───────────
  for (const [alias, { framework: dueño, razon }] of Object.entries(ALIAS_HEREDADOS)) {
    const calificado = calificar(alias, dueño);

    for (const { framework, imports } of mapas) {
      const loDeclara = Object.hasOwn(imports, alias);

      // 2. Un framework que NO es el dueño declarando el nombre agnóstico. Es
      //    la forma de cometerlo sin querer, y se rechaza aunque todavía no
      //    haya con quién colisionar: el daño llega el día que el dueño publique.
      if (framework !== dueño && loDeclara) {
        errores.push(
          `runtime/${framework}/ declara el specifier agnóstico "${alias}", que es de ` +
            `${dueño} (${razon}). Publicá "${calificar(alias, framework)}" en su lugar: ` +
            `el nombre agnóstico apagará el sitio en cuanto ${dueño} publique el suyo.`,
        );
      }

      if (framework !== dueño) continue;

      // 3. El dueño retirando su propio alias. `cdn.config.mjs` ya lo dice de
      //    los externals: quitar una entrada es peor que dejarla.
      if (!loDeclara) {
        errores.push(
          `runtime/${dueño}/ dejó de declarar "${alias}". ${razon}`,
        );
        continue;
      }

      // 4. El alias sin su gemelo calificado no da salida a nadie: es la
      //    entrada que hace que una plataforma nueva pueda publicar sin chocar.
      if (imports[calificado] !== imports[alias]) {
        errores.push(
          `runtime/${dueño}/ declara "${alias}" y no su gemelo "${calificado}" con la MISMA ` +
            `URL (${alias} → ${imports[alias]}, ${calificado} → ${imports[calificado] ?? '(ausente)'}). ` +
            `Con la misma URL el CMS los deduplica; sin el gemelo, la migración no tiene a ` +
            `dónde ir y el alias agnóstico se queda de única puerta.`,
        );
      }
    }
  }

  return errores;
}
