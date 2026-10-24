// ─── El flujo viajes.reserva por la puerta (núcleo N3) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.Bff.Viajes.json (repo del CMS). NO se edita a mano.
// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación
// puestas, y sus argumentos y su respuesta tipados por el contrato generado.

import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';
import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';
import type { ResultadoDelFlujo } from '../transporte';

/** La clave del flujo, como la marca su orquestador. */
export const FLUJO_VIAJES_RESERVA = "viajes.reserva";

type Operaciones = OperacionesDeLaPuerta[typeof FLUJO_VIAJES_RESERVA];

/** `abrir`: POST con cuerpo; llave requerida. */
export function abrirViajesReserva(
  desde: Element,
  args: ArgsDe<Operaciones["abrir"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["abrir"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_RESERVA, "abrir", args, opciones);
}

/** `cancelar`: POST con consulta; llave ninguna. */
export function cancelarViajesReserva(
  desde: Element,
  args: ArgsDe<Operaciones["cancelar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cancelar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_RESERVA, "cancelar", args, opciones);
}

/** `cerrar`: POST con consulta; llave ninguna. */
export function cerrarViajesReserva(
  desde: Element,
  args: ArgsDe<Operaciones["cerrar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cerrar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_RESERVA, "cerrar", args, opciones);
}

/** `consultar`: GET con consulta; llave ninguna. */
export function consultarViajesReserva(
  desde: Element,
  args: ArgsDe<Operaciones["consultar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["consultar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_RESERVA, "consultar", args, opciones);
}

/** `cotizar`: POST con cuerpo; llave ninguna. */
export function cotizarViajesReserva(
  desde: Element,
  args: ArgsDe<Operaciones["cotizar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cotizar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_RESERVA, "cotizar", args, opciones);
}

/** `listar`: GET con consulta; llave ninguna. */
export function listarViajesReserva(
  desde: Element,
  args: ArgsDe<Operaciones["listar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["listar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_RESERVA, "listar", args, opciones);
}
