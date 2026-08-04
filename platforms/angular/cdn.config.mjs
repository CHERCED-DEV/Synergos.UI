/**
 * El contrato de runtime del CDN: qué NO se empaqueta dentro de un elemento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA LISTA ES LA ARQUITECTURA ENTERA DEL CDN, EN DOCE LÍNEAS.
 *
 * Un elemento publicado pesa ~2 KB porque todo lo de abajo queda FUERA de su
 * bundle, como bare import (`from "@angular/core"`), y lo resuelve el
 * import-map que la página carga en el <head> (dist/runtime/angular/<ver>/).
 * Así, veinte elementos en una página comparten UN solo Angular — que es la
 * idea fundacional de este repo: integrar componentes en Umbraco sin module
 * federation y sin pagar un framework por componente.
 *
 * Vivía enterrada en el nx.json (targetDefaults → configurations.production →
 * externalDependencies) y `tools/build-runtime.mjs` la leía de ahí. Al purgar
 * Nx, la lista pasa a ser un fichero propio — porque es un CONTRATO, no una
 * opción de un build tool: cambiarla cambia qué puede resolver el navegador.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Añadir una entrada exige tocar DOS sitios más, y los dos están acoplados a
 * esta lista a propósito:
 *   1. `tools/build-runtime.mjs` → produce el bundle de runtime que la sirve
 *   2. `buildImportMap()` ahí mismo → la ruta que el navegador resuelve
 * Quitar una entrada es peor: los elementos ya publicados siguen haciendo el
 * bare import y el navegador no tiene de dónde resolverlo.
 */

/** Lo que un elemento importa del runtime compartido y NUNCA empaqueta. */
export const EXTERNALS = [
  '@angular/core',
  '@angular/compiler',
  '@angular/common',
  '@angular/common/http',
  '@angular/elements',
  '@angular/forms',
  '@angular/platform-browser',
  '@angular/router',
  'rxjs',
  'rxjs/operators',
  '@synergos/core',
  '@synergos/shared',
];

/** Solo el runtime de Angular — lo que sg-core.js puede dar por resuelto. */
export const ANGULAR_EXTERNALS = EXTERNALS.filter((e) => !e.startsWith('@synergos/'));

/**
 * Los paquetes @synergos que SÍ se empaquetan dentro de cada elemento.
 *
 * No están en EXTERNALS a propósito: `rendering`, `shop`, etc. son código de
 * feature que cambia con el elemento que lo usa — compartirlos por import-map
 * acoplaría el despliegue de todos los elementos al de una lib. `core` y
 * `shared` sí se comparten porque son el vocabulario común y pesan.
 */
export const BUNDLED_SYNERGOS = [
  'rendering',
  'integrations',
  'transaction-engine',
  'shells',
  'shop',
];
