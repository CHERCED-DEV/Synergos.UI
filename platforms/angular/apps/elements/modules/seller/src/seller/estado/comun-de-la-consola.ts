import { type EstadoDeLaDevolucion, type LecturaDeLaConsola } from '@synergos/dominio/tienda';

/** Lo que comparten las vistas y el estado de la consola (014-despiece-tienda, T011). */
/** Dónde está una lectura: sin pedir, en vuelo, leída, vacía, de ejemplo (sólo con la marca) o por qué no. */
export type EstadoDeLectura = 'sin-cargar' | 'cargando' | LecturaDeLaConsola<unknown>['tipo'];

/** El prefijo del id de la acción de fila de un acto del despacho: `acto:preparar`, `acto:enviar`, `acto:entregar`. */
export const PREFIJO_DEL_ACTO = 'acto:';

/** El prefijo del id de la acción de fila que mueve una devolución: `devolucion:approved`, `devolucion:refunded`… */
export const PREFIJO_DE_LA_DEVOLUCION = 'devolucion:';

/** Si una devolución pide algo al personal: las de «Abiertas», y las que cuenta su insignia. */
export const estaAbierta = (estado: EstadoDeLaDevolucion): boolean =>
  estado === 'Requested' || estado === 'Received' || estado === 'Approved';
