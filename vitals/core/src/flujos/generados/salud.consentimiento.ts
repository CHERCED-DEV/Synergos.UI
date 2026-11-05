// ─── El flujo salud.consentimiento por la puerta (núcleo N3) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.Bff.Salud.json (repo del CMS). NO se edita a mano.
// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación
// puestas, y sus argumentos y su respuesta tipados por el contrato generado.

import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';
import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';
import type { ResultadoDelFlujo } from '../transporte';

/** La clave del flujo, como la marca su orquestador. */
export const FLUJO_SALUD_CONSENTIMIENTO = "salud.consentimiento";

type Operaciones = OperacionesDeLaPuerta[typeof FLUJO_SALUD_CONSENTIMIENTO];

/** `abrir`: POST con cuerpo; llave requerida. */
export function abrirSaludConsentimiento(
  desde: Element,
  args: ArgsDe<Operaciones["abrir"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["abrir"]>>> {
  return pedirAlFlujo(desde, FLUJO_SALUD_CONSENTIMIENTO, "abrir", args, opciones);
}

/** `cancelar`: POST con consulta; llave ninguna. */
export function cancelarSaludConsentimiento(
  desde: Element,
  args: ArgsDe<Operaciones["cancelar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["cancelar"]>>> {
  return pedirAlFlujo(desde, FLUJO_SALUD_CONSENTIMIENTO, "cancelar", args, opciones);
}

/** `consultar`: GET con consulta; llave ninguna. */
export function consultarSaludConsentimiento(
  desde: Element,
  args: ArgsDe<Operaciones["consultar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["consultar"]>>> {
  return pedirAlFlujo(desde, FLUJO_SALUD_CONSENTIMIENTO, "consultar", args, opciones);
}

/** `listar`: GET con consulta; llave ninguna. */
export function listarSaludConsentimiento(
  desde: Element,
  args: ArgsDe<Operaciones["listar"]>,
  opciones?: OpcionesDePedido,
): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones["listar"]>>> {
  return pedirAlFlujo(desde, FLUJO_SALUD_CONSENTIMIENTO, "listar", args, opciones);
}
