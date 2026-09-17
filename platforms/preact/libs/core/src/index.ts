// La superficie pública de `@synergos/preact-core`.
//
// ⚠ `@synergos/core` (agnóstico, → `vitals/core`) NO se pisa acá, al revés que
// en Angular. Allá `@synergos/core` apunta a `libs/core/` y el agnóstico queda
// como `@synergos/vitals-core`; eso es historia de un repo que tuvo una sola
// plataforma, y repetirlo acá habría hecho que el MISMO specifier significara
// dos cosas distintas según la carpeta. Esta plataforma nombra lo suyo con su
// prefijo y deja el agnóstico en paz — que es la misma regla que #58 impuso a
// los import maps, aplicada al tsconfig.
export * from './element-protocol/preact-element';
