// ─── El flujo tienda.envio por la puerta (núcleo N3) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.Bff.Tienda.json (repo del CMS). NO se edita a mano.
// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación
// puestas, y sus argumentos y su respuesta tipados por el contrato generado.

import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';
import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';
import type { ResultadoDelFlujo } from '../transporte';

/** La clave del flujo, como la marca su orquestador. */
export const FLUJO_TIENDA_ENVIO = "tienda.envio";

type Operaciones = OperacionesDeLaPuerta[typeof FLUJO_TIENDA_ENVIO];

/** `abrir`: POST con cuerpo; llave requerida. */
export function abrirTiendaEnvio(
  desde: Element,
  args: ArgsDe<Operaciones["abrir"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["abrir"]>>> {
  return pedirAlFlujo(desde, FLUJO_TIENDA_ENVIO, "abrir", args, opciones);
}

/** `cancelar`: POST con consulta; llave ninguna. */
export function cancelarTiendaEnvio(
  desde: Element,
  args: ArgsDe<Operaciones["cancelar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cancelar"]>>> {
  return pedirAlFlujo(desde, FLUJO_TIENDA_ENVIO, "cancelar", args, opciones);
}

/** `consultar`: GET con consulta; llave ninguna. */
export function consultarTiendaEnvio(
  desde: Element,
  args: ArgsDe<Operaciones["consultar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["consultar"]>>> {
  return pedirAlFlujo(desde, FLUJO_TIENDA_ENVIO, "consultar", args, opciones);
}

/** `detalle`: POST con cuerpo; llave ninguna. */
export function detalleTiendaEnvio(
  desde: Element,
  args: ArgsDe<Operaciones["detalle"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["detalle"]>>> {
  return pedirAlFlujo(desde, FLUJO_TIENDA_ENVIO, "detalle", args, opciones);
}

/** `listar`: GET con consulta; llave ninguna. */
export function listarTiendaEnvio(
  desde: Element,
  args: ArgsDe<Operaciones["listar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["listar"]>>> {
  return pedirAlFlujo(desde, FLUJO_TIENDA_ENVIO, "listar", args, opciones);
}
