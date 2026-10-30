// ─── El flujo gobierno.radicacion por la puerta (núcleo N3) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.Bff.Gobierno.json (repo del CMS). NO se edita a mano.
// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación
// puestas, y sus argumentos y su respuesta tipados por el contrato generado.

import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';
import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';
import type { ResultadoDelFlujo } from '../transporte';

/** La clave del flujo, como la marca su orquestador. */
export const FLUJO_GOBIERNO_RADICACION = "gobierno.radicacion";

type Operaciones = OperacionesDeLaPuerta[typeof FLUJO_GOBIERNO_RADICACION];

/** `abrir`: POST con cuerpo; llave requerida. */
export function abrirGobiernoRadicacion(
  desde: Element,
  args: ArgsDe<Operaciones["abrir"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["abrir"]>>> {
  return pedirAlFlujo(desde, FLUJO_GOBIERNO_RADICACION, "abrir", args, opciones);
}

/** `cancelar`: POST con consulta; llave ninguna. */
export function cancelarGobiernoRadicacion(
  desde: Element,
  args: ArgsDe<Operaciones["cancelar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cancelar"]>>> {
  return pedirAlFlujo(desde, FLUJO_GOBIERNO_RADICACION, "cancelar", args, opciones);
}

/** `cerrar`: POST con consulta; llave ninguna. */
export function cerrarGobiernoRadicacion(
  desde: Element,
  args: ArgsDe<Operaciones["cerrar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cerrar"]>>> {
  return pedirAlFlujo(desde, FLUJO_GOBIERNO_RADICACION, "cerrar", args, opciones);
}

/** `consultar`: GET con consulta; llave ninguna. */
export function consultarGobiernoRadicacion(
  desde: Element,
  args: ArgsDe<Operaciones["consultar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["consultar"]>>> {
  return pedirAlFlujo(desde, FLUJO_GOBIERNO_RADICACION, "consultar", args, opciones);
}

/** `cotizar`: POST con cuerpo; llave ninguna. */
export function cotizarGobiernoRadicacion(
  desde: Element,
  args: ArgsDe<Operaciones["cotizar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cotizar"]>>> {
  return pedirAlFlujo(desde, FLUJO_GOBIERNO_RADICACION, "cotizar", args, opciones);
}

/** `listar`: GET con consulta; llave ninguna. */
export function listarGobiernoRadicacion(
  desde: Element,
  args: ArgsDe<Operaciones["listar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["listar"]>>> {
  return pedirAlFlujo(desde, FLUJO_GOBIERNO_RADICACION, "listar", args, opciones);
}
