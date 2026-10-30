// ─── Los contratos HTTP de los orquestadores (ADR 0140, F2) ───
// GENERADO por tools/contrato-http.mjs: uno por cada `Synergos.Bff.*.json` del CMS, cada uno
// en su espacio de nombres (cada documento trae sus propios esquemas). NO se edita a mano.

export * as BffAlquiler from './bff-alquiler.contract';
export * as BffEducacion from './bff-educacion.contract';
export * as BffEventos from './bff-eventos.contract';
export * as BffGobierno from './bff-gobierno.contract';
export * as BffPropiedades from './bff-propiedades.contract';
export * as BffReservas from './bff-reservas.contract';
export * as BffSalud from './bff-salud.contract';
export * as BffTienda from './bff-tienda.contract';
export * as BffViajes from './bff-viajes.contract';

import * as $BffAlquiler from './bff-alquiler.contract';
import * as $BffEducacion from './bff-educacion.contract';
import * as $BffEventos from './bff-eventos.contract';
import * as $BffGobierno from './bff-gobierno.contract';
import * as $BffPropiedades from './bff-propiedades.contract';
import * as $BffReservas from './bff-reservas.contract';
import * as $BffSalud from './bff-salud.contract';
import * as $BffTienda from './bff-tienda.contract';
import * as $BffViajes from './bff-viajes.contract';

/**
 * Lo que la puerta expone de TODOS los orquestadores, por flujo y por su nombre en la puerta: la
 * unión de sus mapas. Un flujo vive en un solo orquestador, así que las claves no se pisan.
 */
export type OperacionesDeLaPuerta = $BffAlquiler.OperacionesDeLaPuerta & $BffEducacion.OperacionesDeLaPuerta & $BffEventos.OperacionesDeLaPuerta & $BffGobierno.OperacionesDeLaPuerta & $BffPropiedades.OperacionesDeLaPuerta & $BffReservas.OperacionesDeLaPuerta & $BffSalud.OperacionesDeLaPuerta & $BffTienda.OperacionesDeLaPuerta & $BffViajes.OperacionesDeLaPuerta;

/** La forma en ejecución de cada operación de un mapa (la misma en todos los documentos). */
export type TablaDeLaPuerta<TOperaciones> = $BffAlquiler.TablaDeLaPuerta<TOperaciones>;

/** Las filas en ejecución de todos los orquestadores, juntas: lo que lee el cliente de la puerta. */
export const OPERACIONES_DE_LA_PUERTA = {
  ...$BffAlquiler.OPERACIONES_DE_LA_PUERTA,
  ...$BffEducacion.OPERACIONES_DE_LA_PUERTA,
  ...$BffEventos.OPERACIONES_DE_LA_PUERTA,
  ...$BffGobierno.OPERACIONES_DE_LA_PUERTA,
  ...$BffPropiedades.OPERACIONES_DE_LA_PUERTA,
  ...$BffReservas.OPERACIONES_DE_LA_PUERTA,
  ...$BffSalud.OPERACIONES_DE_LA_PUERTA,
  ...$BffTienda.OPERACIONES_DE_LA_PUERTA,
  ...$BffViajes.OPERACIONES_DE_LA_PUERTA,
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
