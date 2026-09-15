/**
 * Qué hay que comprobar en un CDN recién desplegado, y con qué se compara.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO SE PUEDE PROBAR CON UN TEST UNITARIO, Y POR ESO EXISTE.
 *
 * El día que el CDN se estrenó, los 17 tests de `cdn-cache-policy.spec.mjs`
 * estaban en verde. Correctos, además: la función calculaba bien. Lo que
 * fallaba era que **nadie la llamaba**.
 *
 *   > Cloudflare sirve los assets estáticos ANTES de invocar al Worker. Con la
 *   > configuración por defecto, `worker/index.js` nunca corría: todo salía con
 *   > `max-age=0, must-revalidate` y **sin `access-control-allow-origin`**. La
 *   > política de caché entera era letra muerta, y el CMS —que vive en otro
 *   > origen— no habría podido ejecutar ni un bundle.
 *
 * Se encontró con `curl` a mano. Se arregló con `run_worker_first: true`
 * (`91a0a38`). Un test unitario no podía verlo y nunca va a poder: es
 * comportamiento de la plataforma, no del código.
 *
 * Lo que SÍ se puede probar es lo de acá: cómo se leen las cabeceras y qué
 * se considera correcto. Las peticiones viven en `tools/humo-cdn.mjs`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { UN_ANO, CORTO, INDICE } from './cdn-cache-policy.mjs';
import { frameworksDelRegistry } from './frameworks.mjs';

/**
 * Lee `max-age` de un `Cache-Control`.
 *
 * @returns {number|null} `null` si no hay cabecera o no trae `max-age`.
 */
export function maxAge(cacheControl) {
  if (!cacheControl) return null;
  const m = /max-age\s*=\s*(\d+)/i.exec(cacheControl);
  return m ? Number(m[1]) : null;
}

/**
 * Una muestra POR FRAMEWORK publicado, sacada del registry (issue #44).
 *
 * SE TOMA EL PRIMERO DE CADA UNO, NO SE CABLEA NINGUNO. Un `badge` escrito a
 * mano en el humo se pudre el día que alguien lo renombre, y el síntoma sería
 * un humo rojo que no significa nada — o peor, uno que alguien borra por
 * molesto. Lo mismo vale para el framework, y ahí el síntoma era peor: un
 * `angular` cableado no daba rojo, daba **verde sobre el framework
 * equivocado**. El humo de un despliegue con dos frameworks certificaba uno.
 *
 * Se devuelve UNA muestra por framework y no una sola global porque las rutas
 * del CDN llevan el framework dentro: comprobar `badge/angular/...` no dice
 * absolutamente nada sobre si `card/react/...` se está sirviendo.
 *
 * @param {{elements?: Array}} registry El `registry.json` ya parseado.
 * @returns {{ framework: string, nombre: string, version: string }[]}
 */
export function muestrasPorFramework(registry) {
  const elementos = registry?.elements ?? [];
  if (elementos.length === 0) {
    throw new Error('el registry no trae elementos — el despliegue está vacío');
  }

  // Los frameworks salen de lo que el registry DECLARA como publicado, no de
  // una lista. Que una entrada no traiga implementación es legítimo (el CMS
  // declara tipos antes de que exista el web component), pero con esas no hay
  // nada que pedirle al CDN.
  const frameworks = frameworksDelRegistry(registry);
  if (frameworks.length === 0) {
    throw new Error(
      `el registry trae ${elementos.length} elementos y ninguno con implementación publicada`,
    );
  }

  return frameworks.map((framework) => {
    const conBundle = elementos.find((e) => e?.implementations?.[framework]?.latest);
    return {
      framework,
      nombre: conBundle.name,
      version: conBundle.implementations[framework].latest,
    };
  });
}

/**
 * Lo que se comprueba UNA vez por despliegue, pase lo que pase con los frameworks.
 *
 * Que sean datos y no código es lo que permite probarlas sin red, y lo que
 * hace que añadir una comprobación sea una línea y no una función.
 */
export function comprobacionesGlobales() {
  return [
    {
      que: 'el catálogo — es lo primero que uno abre para ver si el despliegue salió',
      ruta: '/',
      estado: 200,
      // El catálogo NO lleva CORS: no está bajo /synergos/ y nadie lo consume
      // desde otro origen. Exigirlo sería inventar un requisito.
      cors: false,
    },
    {
      que: 'el índice — cachearlo mucho es lo mismo que no publicar',
      ruta: '/synergos/registry.json',
      estado: 200,
      maxAge: INDICE,
      inmutable: false,
      cors: true,
    },
  ];
}

/**
 * Lo que se comprueba POR CADA framework publicado (issue #44).
 *
 * Están separadas de las globales porque son preguntas distintas: el catálogo
 * y el índice son del despliegue, y las cuatro de acá son de UNA plataforma.
 * Pedir el catálogo N veces sería ruido; NO pedir estas cuatro por cada
 * framework era el defecto — el humo daba por bueno un despliegue entero
 * habiendo mirado un solo segmento de ruta.
 *
 * @param {{ nombre: string, version: string, framework: string }} elemento
 * @param {{ version: string, ruta: string }} runtimeVersion Lo que devuelve
 *        `runtimeDelImportMap` para ESE framework.
 */
export function comprobacionesDeFramework(elemento, runtimeVersion) {
  const { nombre, version, framework } = elemento;

  if (!framework) {
    // Sin framework no hay ruta que pedir, y caer a 'angular' sería volver a
    // escribir la suposición que este ticket vino a borrar.
    throw new Error(`la muestra "${nombre}" no dice de qué framework es`);
  }

  return [
    {
      que: `[${framework}] un bundle en \`latest\` — se mueve, así que NUNCA puede ser inmutable`,
      ruta: `/synergos/${nombre}/${framework}/latest/main.js`,
      estado: 200,
      maxAge: CORTO,
      inmutable: false,
      cors: true,
    },
    {
      que: `[${framework}] el mismo bundle en su versión exacta — esa sí, un año`,
      ruta: `/synergos/${nombre}/${framework}/${version}/main.js`,
      estado: 200,
      maxAge: UN_ANO,
      inmutable: true,
      cors: true,
    },
    {
      que: `[${framework}] el runtime compartido — sin él los bundles cargan y se rompen al arrancar`,
      // La ruta la dice el import-map, no este fichero: `ng-core.js` es el
      // nombre que le pone el runtime de Angular, y otro framework le pondrá
      // otro. Escribirlo acá habría sido cambiar un cableado por otro.
      ruta: runtimeVersion.ruta,
      estado: 200,
      maxAge: UN_ANO,
      inmutable: true,
      cors: true,
    },
    {
      que: `[${framework}] una ruta que no existe — un 404 cacheado es un bundle nuevo que no existe para alguien`,
      ruta: `/synergos/no-existe-jamas-de-los-jamases/${framework}/latest/main.js`,
      estado: 404,
      sinCache: true,
    },
  ];
}

/**
 * Juzga UNA respuesta contra lo que se esperaba.
 *
 * @param {object} esperado Una entrada de `comprobaciones()`.
 * @param {{ estado: number, cabeceras: Map<string,string>|object }} real
 * @returns {string[]} Los motivos por los que falla. Vacío = pasa.
 */
export function juzgar(esperado, real) {
  const fallos = [];
  const leer = (n) =>
    typeof real.cabeceras?.get === 'function'
      ? real.cabeceras.get(n)
      : real.cabeceras?.[n] ?? real.cabeceras?.[n.toLowerCase()];

  if (real.estado !== esperado.estado) {
    fallos.push(`estado ${real.estado}, se esperaba ${esperado.estado}`);
    // Sin el estado correcto, las cabeceras no dicen nada útil: un 404 de
    // Cloudflare trae las suyas y compararlas sólo añade ruido al informe.
    return fallos;
  }

  const cc = leer('cache-control');

  if (esperado.sinCache) {
    // El Worker devuelve el 404 tal cual y NO le pone cabeceras de caché.
    // Cloudflare puede añadir las suyas; lo que no puede aparecer es una caché
    // larga sobre un "no existe".
    const edad = maxAge(cc);
    if (edad !== null && edad > INDICE) {
      fallos.push(`un 404 con max-age=${edad}: se cacheó un "no existe"`);
    }
    if (cc && /immutable/i.test(cc)) {
      fallos.push(`un 404 marcado immutable — eso no se arregla purgando nada`);
    }
    return fallos;
  }

  if (esperado.maxAge !== undefined) {
    const edad = maxAge(cc);
    if (edad !== esperado.maxAge) {
      fallos.push(`max-age=${edad ?? '(ninguno)'}, se esperaba ${esperado.maxAge} — cache-control: ${cc ?? '(sin cabecera)'}`);
    }
  }

  if (esperado.inmutable !== undefined) {
    const esInmutable = Boolean(cc && /immutable/i.test(cc));
    if (esInmutable !== esperado.inmutable) {
      fallos.push(
        esperado.inmutable
          ? 'falta `immutable` en una ruta versionada'
          : 'lleva `immutable` una ruta QUE SE MUEVE — publicar algo nuevo y que nadie lo vea en un año',
      );
    }
  }

  if (esperado.cors === true && leer('access-control-allow-origin') !== '*') {
    // Es el fallo que ya mordió una vez, y el que más caro sale: el CMS vive en
    // otro origen, así que sin esto el navegador descarga el bundle y luego se
    // niega a ejecutarlo, con un error que no menciona el CDN.
    fallos.push('sin access-control-allow-origin: el CMS no podría ejecutar el bundle');
  }

  return fallos;
}

/**
 * Qué runtime sirve un import-map, leído del propio import-map (issue #44).
 *
 * El humo sacaba la versión con `/runtime\/angular\/([^/]+)\//` y pedía después
 * `…/ng-core.js` a mano. Las dos cosas eran el mismo cableado con dos caras: el
 * segmento de framework y el nombre del asset. Ninguna se puede escribir sin
 * decidir por adelantado quién publica.
 *
 * Lo que SÍ es un hecho: el import-map es el fichero que el navegador resuelve,
 * así que **lo que él apunte es el runtime que se está sirviendo**. De ahí salen
 * la versión y una ruta real que pedir.
 *
 * @param {{ imports?: Record<string,string> }} mapa
 * @param {string} framework
 * @returns {{ version: string, ruta: string }}
 */
export function runtimeDelImportMap(mapa, framework) {
  const patron = new RegExp(`/synergos/runtime/${framework}/([^/]+)/[^/]+$`);

  for (const destino of Object.values(mapa?.imports ?? {})) {
    const m = patron.exec(String(destino));
    if (m) return { version: m[1], ruta: String(destino) };
  }

  throw new Error(
    `el import-map de "${framework}" no apunta a ningún /synergos/runtime/${framework}/<versión>/… ` +
      `(tiene ${Object.keys(mapa?.imports ?? {}).length} entradas). Sin eso no se sabe qué runtime se sirve.`,
  );
}
