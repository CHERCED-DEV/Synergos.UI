// La API pública de @synergos/dominio/salud (003-salud-cita, I1 de producción).
//
// El dominio de Salud que compone su app, `ehr`, con la receta de la tienda (014-despiece-tienda): los modelos y los
// adaptadores que leen las lecturas genéricas y la puerta. No es una hoja del design system: lo que se pinta lo
// decide la app, y lo que aquí se nombra es el vocabulario de Salud.
//
// Se empaqueta dentro del elemento que la usa (`BUNDLED_SYNERGOS`), como `dominio/tienda`.

export * from './lib/directorio/directorio.model';
export { leerDirectorio, profesionalesDelListado } from './lib/directorio/directorio-api.client';
