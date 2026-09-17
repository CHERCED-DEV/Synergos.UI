/**
 * El contrato de runtime del CDN para Preact — el gemelo del de Angular.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MISMA IDEA Y UN ORDEN DE MAGNITUD MENOS DE PESO.
 *
 * Un elemento publicado NO empaqueta su framework: lo deja como bare import y lo
 * resuelve el import map del `<head>`. Veinte elementos en una página comparten
 * UN runtime, que es la idea fundacional del repo.
 *
 * Medido contra jsdelivr el 2026-09-16, comprimido: `preact` 4.827 B + `preact/
 * hooks` 1.580 B = **6,4 KB**, contra los ≈133 KB del runtime de Angular sin
 * contar `sg-shared`. Ése es el número que la épica #37 preguntaba y que sólo se
 * puede contestar publicando: **el piso de una página con un solo badge**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS SPECIFIERS SON CALIFICADOS, Y ESO NO ES ESTILO: ES LA REGLA 26.
 *
 * El CMS compone UN import map juntando el de cada framework, y el mismo
 * specifier con URLs distintas **no lo resuelve: lo PARA** — devuelve `null`, la
 * vista no emite ningún `<script type="importmap">` y **la página no hidrata
 * NADA, Angular incluido**.
 *
 * Angular publica `@synergos/core` y `@synergos/shared` —nombres AGNÓSTICOS con
 * destinos suyos— porque los bundles ya publicados hacen ese bare import y no se
 * pueden retirar; desde #58 publica además su gemelo calificado a la MISMA url,
 * que es lo que deduplica. **Una plataforma nueva publica SÓLO el calificado**,
 * y por eso acá dice `@synergos/preact-shared` y no `@synergos/shared`. Poner el
 * agnóstico sería apagar el sitio entero con un `publish` de este repo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo que un elemento importa del runtime compartido y NUNCA empaqueta. */
export const EXTERNALS = [
  'preact',
  'preact/hooks',
  'preact/jsx-runtime',
  '@synergos/preact-core',
  '@synergos/preact-shared',
];

/** Sólo el runtime del framework — lo que el bundle de `shared` da por resuelto. */
export const PREACT_EXTERNALS = EXTERNALS.filter((e) => !e.startsWith('@synergos/'));

/**
 * Lo que SÍ se empaqueta dentro de cada elemento.
 *
 * `@synergos/core` y `@synergos/contracts` resuelven a `vitals/`, y de ahí sale
 * el normalizador de lo que emite el CMS (#63). Van DENTRO del elemento y no en
 * el import map porque son funciones puras que el minificador poda: un elemento
 * que usa tres `coerce*` se lleva tres, no los veinte.
 *
 * Lo que sí queda fuera es `preact-core` —el adaptador de montaje— y
 * `preact-shared` —el design system con su CSS—, que es el mismo reparto que
 * Angular hace con `sg-core.js` y `sg-shared.js`. La comparación de peso de la
 * épica #37 sólo significa algo si las dos plataformas parten los bundles igual.
 */
export const BUNDLED_SYNERGOS = ['core', 'contracts'];
