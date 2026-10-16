// ─── El flujo eventos.compra por la puerta (núcleo N3) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.Bff.Eventos.json (repo del CMS). NO se edita a mano.
// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación
// puestas, y sus argumentos y su respuesta tipados por el contrato generado.

import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';
import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';
import type { ResultadoDelFlujo } from '../transporte';

/** La clave del flujo, como la marca su orquestador. */
export const FLUJO_EVENTOS_COMPRA = "eventos.compra";

type Operaciones = OperacionesDeLaPuerta[typeof FLUJO_EVENTOS_COMPRA];

/** `abrir`: POST con cuerpo; llave requerida. */
export function abrirEventosCompra(
  desde: Element,
  args: ArgsDe<Operaciones["abrir"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["abrir"]>>> {
  return pedirAlFlujo(desde, FLUJO_EVENTOS_COMPRA, "abrir", args, opciones);
}

/** `cancelar`: POST con consulta; llave ninguna. */
export function cancelarEventosCompra(
  desde: Element,
  args: ArgsDe<Operaciones["cancelar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cancelar"]>>> {
  return pedirAlFlujo(desde, FLUJO_EVENTOS_COMPRA, "cancelar", args, opciones);
}

/** `cerrar`: POST con consulta; llave ninguna. */
export function cerrarEventosCompra(
  desde: Element,
  args: ArgsDe<Operaciones["cerrar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cerrar"]>>> {
  return pedirAlFlujo(desde, FLUJO_EVENTOS_COMPRA, "cerrar", args, opciones);
}

/** `consultar`: GET con consulta; llave ninguna. */
export function consultarEventosCompra(
  desde: Element,
  args: ArgsDe<Operaciones["consultar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["consultar"]>>> {
  return pedirAlFlujo(desde, FLUJO_EVENTOS_COMPRA, "consultar", args, opciones);
}

/** `cotizar`: POST con cuerpo; llave ninguna. */
export function cotizarEventosCompra(
  desde: Element,
  args: ArgsDe<Operaciones["cotizar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cotizar"]>>> {
  return pedirAlFlujo(desde, FLUJO_EVENTOS_COMPRA, "cotizar", args, opciones);
}
