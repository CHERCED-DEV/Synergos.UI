// ─── Los contratos HTTP de los orquestadores (ADR 0140, F2) ───
// GENERADO por tools/contrato-http.mjs: uno por cada `Synergos.Bff.*.json` del CMS, cada uno
// en su espacio de nombres (cada documento trae sus propios esquemas). NO se edita a mano.

export * as BffEventos from './bff-eventos.contract';
export * as BffReservas from './bff-reservas.contract';

import * as $BffEventos from './bff-eventos.contract';
import * as $BffReservas from './bff-reservas.contract';

/**
 * Lo que la puerta expone de TODOS los orquestadores, por flujo y por su nombre en la puerta: la
 * unión de sus mapas. Un flujo vive en un solo orquestador, así que las claves no se pisan.
 */
export type OperacionesDeLaPuerta = $BffEventos.OperacionesDeLaPuerta & $BffReservas.OperacionesDeLaPuerta;

/** La forma en ejecución de cada operación de un mapa (la misma en todos los documentos). */
export type TablaDeLaPuerta<TOperaciones> = $BffEventos.TablaDeLaPuerta<TOperaciones>;

/** Las filas en ejecución de todos los orquestadores, juntas: lo que lee el cliente de la puerta. */
export const OPERACIONES_DE_LA_PUERTA = {
  ...$BffEventos.OPERACIONES_DE_LA_PUERTA,
  ...$BffReservas.OPERACIONES_DE_LA_PUERTA,
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
