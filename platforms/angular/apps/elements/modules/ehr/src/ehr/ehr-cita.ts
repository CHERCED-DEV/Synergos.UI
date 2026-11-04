/**
 * La cita por la puerta (003-salud-cita, ADR 0140) se mudó al dominio de Salud con el despiece de las vistas de I1 (T051):
 * `@synergos/dominio/salud` (`lib/cita` y `lib/permiso`). Este fichero la reexporta, con los mismos nombres, para quien ya
 * la importaba desde la app.
 */
export {
  abrirCita,
  cancelarCita,
  cerrarCita,
  consultarCita,
  cotizarCita,
  darElPermiso,
  entradaDeLaCita,
  escribirYAsentar,
  franjasDelProfesional,
  leerCita,
  listarCitas,
  retirarElPermiso,
  ventanaDeLaCita,
  type CitaAsentada,
  type CitaLeida,
  type FranjaDeLaAgenda,
  type Importe,
  type Ventana,
} from '@synergos/dominio/salud';

export { relojEnZona, zonaValida } from '@synergos/vitals-core';
