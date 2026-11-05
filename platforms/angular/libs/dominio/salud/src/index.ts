// La API pública de @synergos/dominio/salud (003-salud-cita, I1 de producción).
//
// El dominio de Salud que compone su app, `ehr`, con la receta de la tienda (014-despiece-tienda): los modelos, los
// adaptadores que leen las lecturas genéricas y la puerta, y las fachadas con el estado y los casos de uso de las vistas
// (T051). No es una hoja del design system: lo que se pinta lo decide la app, y lo que aquí se nombra es el vocabulario de
// Salud.
//
// Se empaqueta dentro del elemento que la usa (`BUNDLED_SYNERGOS`), como `dominio/tienda`.

export * from './lib/directorio/directorio.model';
export { leerDirectorio, profesionalesDelListado } from './lib/directorio/directorio-api.client';

export * from './lib/cita/cita.model';
export {
  abrirCita,
  cancelarCita,
  cerrarCita,
  consultarCita,
  cotizarCita,
  entradaDeLaCita,
  escribirYAsentar,
  franjasDelProfesional,
  instanteIso,
  leerCita,
  listarCitas,
  ventanaDeLaCita,
} from './lib/cita/cita-api.client';
export { TEXTOS_DE_SALUD, type TextosDeSalud, type TextosDelPermiso } from './lib/comun/textos';

export { darElPermiso, retirarElPermiso } from './lib/permiso/permiso-api.client';
export { PermisoDeSalud, faltaElPermiso } from './lib/permiso/permiso';

export { AgendaDeSalud, DIAS_DE_LA_AGENDA, franjasDelAsistente, type FranjaDelAsistente } from './lib/agenda/agenda';
