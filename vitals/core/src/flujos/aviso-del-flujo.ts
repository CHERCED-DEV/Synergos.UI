import { AVISOS_DE_LOS_FLUJOS, type AvisoDelFlujo } from './avisos';
import { AVISOS_GENERADOS } from './generados/avisos';
import type { Flujo } from './puerta';

/**
 * El aviso de un flujo —con qué parámetro llega a la página el enlace del correo— (núcleo N3, FR-032):
 * gana el generado de las rutas del CMS; la tabla a mano queda detrás, para quien ya la declaraba. Un
 * participante nuevo lee esto y no escribe su fila en ninguna tabla. `undefined` si nadie avisa de ese flujo.
 */
export function avisoDelFlujo(flujo: Flujo): AvisoDelFlujo | undefined {
  const generados: Readonly<Partial<Record<Flujo, AvisoDelFlujo>>> = AVISOS_GENERADOS;
  const declarados: Readonly<Partial<Record<Flujo, AvisoDelFlujo>>> = AVISOS_DE_LOS_FLUJOS;
  return generados[flujo] ?? declarados[flujo];
}
