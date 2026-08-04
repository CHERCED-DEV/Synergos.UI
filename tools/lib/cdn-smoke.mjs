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
 * El elemento con el que se hace el humo, sacado del registry.
 *
 * SE TOMA EL PRIMERO, NO SE CABLEA UNO. Un `badge` escrito a mano en el humo
 * se pudre el día que alguien lo renombre, y el síntoma sería un humo rojo que
 * no significa nada — o peor, uno que alguien borra por molesto.
 *
 * @param {{elements?: Array}} registry El `registry.json` ya parseado.
 * @returns {{ nombre: string, version: string }}
 */
export function elementoDePrueba(registry) {
  const elementos = registry?.elements ?? [];
  if (elementos.length === 0) {
    throw new Error('el registry no trae elementos — el despliegue está vacío');
  }

  // El primero que tenga implementación en angular. Que el registry traiga
  // entradas sin implementación es legítimo (el CMS declara tipos antes de que
  // exista el web component), pero con esas no hay nada que pedirle al CDN.
  const conBundle = elementos.find((e) => e?.implementations?.angular?.latest);
  if (!conBundle) {
    throw new Error(
      `el registry trae ${elementos.length} elementos y ninguno con implementación angular`,
    );
  }

  return { nombre: conBundle.name, version: conBundle.implementations.angular.latest };
}

/**
 * Las comprobaciones, como DATOS: qué se pide y qué se espera.
 *
 * Que sean datos y no código es lo que permite probarlas sin red, y lo que
 * hace que añadir una comprobación sea una línea y no una función.
 *
 * @param {{ nombre: string, version: string }} elemento
 * @param {string} runtimeVersion Versión publicada del runtime compartido.
 */
export function comprobaciones(elemento, runtimeVersion) {
  const { nombre, version } = elemento;

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
    {
      que: 'un bundle en `latest` — se mueve, así que NUNCA puede ser inmutable',
      ruta: `/synergos/${nombre}/angular/latest/main.js`,
      estado: 200,
      maxAge: CORTO,
      inmutable: false,
      cors: true,
    },
    {
      que: 'el mismo bundle en su versión exacta — esa sí, un año',
      ruta: `/synergos/${nombre}/angular/${version}/main.js`,
      estado: 200,
      maxAge: UN_ANO,
      inmutable: true,
      cors: true,
    },
    {
      que: 'el runtime compartido — sin él los bundles cargan y se rompen al arrancar',
      ruta: `/synergos/runtime/angular/${runtimeVersion}/ng-core.js`,
      estado: 200,
      maxAge: UN_ANO,
      inmutable: true,
      cors: true,
    },
    {
      que: 'una ruta que no existe — un 404 cacheado es un bundle nuevo que no existe para alguien',
      ruta: '/synergos/no-existe-jamas-de-los-jamases/angular/latest/main.js',
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
