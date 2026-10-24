// ─── El flujo viajes.devolucion por la puerta (núcleo N3) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.Bff.Viajes.json (repo del CMS). NO se edita a mano.
// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación
// puestas, y sus argumentos y su respuesta tipados por el contrato generado.

import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';
import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';
import type { ResultadoDelFlujo } from '../transporte';

/** La clave del flujo, como la marca su orquestador. */
export const FLUJO_VIAJES_DEVOLUCION = "viajes.devolucion";

type Operaciones = OperacionesDeLaPuerta[typeof FLUJO_VIAJES_DEVOLUCION];

/** `cancelar`: POST con consulta; llave ninguna. */
export function cancelarViajesDevolucion(
  desde: Element,
  args: ArgsDe<Operaciones["cancelar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cancelar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_DEVOLUCION, "cancelar", args, opciones);
}

/** `consultar`: GET con consulta; llave ninguna. */
export function consultarViajesDevolucion(
  desde: Element,
  args: ArgsDe<Operaciones["consultar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["consultar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_DEVOLUCION, "consultar", args, opciones);
}

/** `devolver`: POST con cuerpo; llave requerida. */
export function devolverViajesDevolucion(
  desde: Element,
  args: ArgsDe<Operaciones["devolver"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["devolver"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_DEVOLUCION, "devolver", args, opciones);
}

/** `listar`: GET con consulta; llave ninguna. */
export function listarViajesDevolucion(
  desde: Element,
  args: ArgsDe<Operaciones["listar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["listar"]>>> {
  return pedirAlFlujo(desde, FLUJO_VIAJES_DEVOLUCION, "listar", args, opciones);
}
