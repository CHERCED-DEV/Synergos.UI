import type { BffViajes } from '@synergos/contracts';
import {
  abrirViajesReserva,
  cancelarViajesReserva,
  cerrarViajesReserva,
  clasificarRechazo,
  consultarViajesReserva,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';

/**
 * La estadía por la puerta (línea 006, ADR 0140): un viaje de UN ítem de `viajes.reserva` (006-P4), tipado con el
 * contrato GENERADO de `Synergos.Bff.Viajes`.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo flujo="viajes.reserva">`) que la vista coloca alrededor del
 * elemento: ninguna ruta propia, ningún `fetch`, y el transporte es el envoltorio GENERADO del flujo.</p>
 *
 * <p>El producto es el `productRef` que la búsqueda del CMS da a cada oferta, y la ventana va de medianoche a
 * medianoche UTC del día de entrada al de salida, como la noche de hotel del CMS. El precio NO viaja: lo cotiza el
 * servidor.</p>
 */

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Lo que la pantalla necesita de la estadía: lo que contestó el servidor, sin adornos. */
export interface EstadiaLeida {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated, CompensationFailed o Stuck. */
  readonly estado: string;
  /** `null` si el servidor no lo dio: la pantalla no inventa un total. */
  readonly total: Importe | null;
  /** Cuándo vence el apartado, si la agenda lo dijo. */
  readonly vence: string | null;
}

function leerEstadia(r: BffViajes.ViajesReservaRespuesta): EstadiaLeida {
  return { id: r.id, numero: r.numero, estado: r.estado, total: r.datos.total, vence: r.datos.vence };
}

function leida(r: ResultadoDelFlujo<BffViajes.ViajesReservaRespuesta>): ResultadoDelFlujo<EstadiaLeida> {
  return r.ok ? { ...r, valor: leerEstadia(r.valor) } : r;
}

/** La noche de hotel como ventana: de la medianoche UTC de la entrada a la de la salida. */
export function ventanaDeLaEstadia(entrada: string, salida: string): { start: string; end: string } | null {
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  const desde = entrada.trim();
  const hasta = salida.trim();
  if (!dia.test(desde) || !dia.test(hasta) || hasta <= desde) {
    return null;
  }
  return { start: `${desde}T00:00:00.000Z`, end: `${hasta}T00:00:00.000Z` };
}

/** Aparta la habitación y autoriza el total, sin mover plata. La llave es la de la intención. */
export async function abrirEstadia(
  desde: Element,
  producto: string,
  etiqueta: string,
  ventana: { start: string; end: string },
  llave: string,
): Promise<ResultadoDelFlujo<EstadiaLeida>> {
  return leida(await abrirViajesReserva(desde, { cuerpo: { items: [{ producto, etiqueta: etiqueta || null, ventana }] }, llave }));
}

/** Captura el total y confirma la habitación. Idempotente sobre una estadía ya completada. */
export async function cerrarEstadia(desde: Element, id: string): Promise<ResultadoDelFlujo<EstadiaLeida>> {
  return leida(await cerrarViajesReserva(desde, { consulta: { id } }));
}

/** Suelta el apartado y anula la autorización de una estadía que no se confirmó. */
export async function cancelarEstadia(desde: Element, id: string): Promise<ResultadoDelFlujo<EstadiaLeida>> {
  return leida(await cancelarViajesReserva(desde, { consulta: { id } }));
}

export async function consultarEstadia(desde: Element, id: string): Promise<ResultadoDelFlujo<EstadiaLeida>> {
  return leida(await consultarViajesReserva(desde, { consulta: { id } }));
}

/**
 * ¿Un «no» de abrir garantiza que no quedó ninguna estadía con esa llave? Sí cuando lo dijo el negocio y cuando la
 * puerta ni lo reenvió (sin sesión, no disponible). Lo transitorio y lo ilegible pueden llegar con la estadía ABIERTA:
 * la llave se queda retenida y el reintento la recupera.
 */
export function abrirNoDejoEstadia(rechazo: RechazoDelFlujo): boolean {
  const clase = clasificarRechazo(rechazo);
  return clase === 'negado' || clase === 'sesion' || clase === 'no_disponible';
}
