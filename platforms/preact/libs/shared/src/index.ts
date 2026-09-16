// La superficie pública de `@synergos/preact-shared`.
//
// Es el gemelo de `platforms/angular/libs/shared/src/index.ts` y hoy tiene UNA
// pieza, porque esta plataforma existe para sostener UN elemento publicado
// (#64) y no al revés. Lo que importa no es cuántas hay: es que el reparto sea
// el mismo —el design system y su CSS viajan en el runtime compartido, no
// dentro de cada elemento— o la comparación de peso de la épica #37 no
// significaría nada.
export * from './components/primitives/badge/badge';
export * from './components/primitives/badge/badge.config';
export { instalarEstilos } from './estilos';
