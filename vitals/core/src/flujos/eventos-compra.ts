import type { BffEventos } from '@synergos/contracts';
import { pedirAlFlujo } from './coordinador';
import type { Flujo } from './puerta';
import type { ResultadoDelFlujo } from './transporte';

/**
 * La compra de Eventos por la puerta, tipada con el contrato GENERADO de `Synergos.Bff.Eventos`:
 * la clave del flujo, las dos operaciones que pide un participante y la lectura de su respuesta.
 *
 * Es lo que hace que la regla 24 se cumpla en `vitals`: un renombre en el orquestador —una
 * operación, el flujo, un campo de la compra— se regenera allá y rompe `test:tipos-vitals` acá,
 * antes que build-specs. Y es agnóstico: lo mismo lo llama Angular que Preact.
 */
export const FLUJO_COMPRA_DE_EVENTOS = 'eventos.compra' as const satisfies Flujo;

/** Lo que la pantalla necesita de una compra: el id de la saga, su estado y el total que se cobra. */
export interface CompraLeida {
  readonly id: string;
  readonly estado: string;
  /** El total en unidades MAYORES de su moneda, como lo publica el contrato (`MoneyDto.amount`). */
  readonly importe: number;
  readonly moneda: string;
  readonly gratis: boolean;
  /** Cuántas entradas quedaron apartadas: tantos asistentes como esto pide el artefacto. */
  readonly apartadas: number;
}

export function leerCompra(r: BffEventos.TicketPurchaseResponse): CompraLeida {
  return {
    id: r.id,
    estado: r.status,
    importe: r.total.amount,
    moneda: r.total.currency,
    gratis: r.total.amount === 0,
    apartadas: r.held.reduce((n, h) => n + h.quantity, 0),
  };
}

function leida(r: ResultadoDelFlujo<BffEventos.TicketPurchaseResponse>): ResultadoDelFlujo<CompraLeida> {
  return r.ok ? { ...r, valor: leerCompra(r.valor) } : r;
}

/**
 * Abre la compra: aparta y autoriza (con total 0 no hay cobro: `omitir_si_cero`). La llave es la
 * de la INTENCIÓN —la misma al reintentar, otra si cambia el carrito—: con la misma llave y una
 * saga en curso, el orquestador devuelve esa saga; con una deshecha, la reabre.
 */
export async function abrirCompraDeEventos(
  desde: Element,
  cuerpo: BffEventos.BuyTicketsRequest,
  llave: string,
): Promise<ResultadoDelFlujo<CompraLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_COMPRA_DE_EVENTOS, 'abrir', { cuerpo, llave }));
}

/**
 * Lee la compra: su estado es lo que dice qué QUEDÓ cuando cerrar no contestó bien (ADR 0140 F4).
 * Un rechazo no transitorio no implica que la saga se deshizo: lo implica `Compensated`.
 */
export async function consultarCompraDeEventos(desde: Element, id: string): Promise<ResultadoDelFlujo<CompraLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_COMPRA_DE_EVENTOS, 'consultar', { consulta: { id } }));
}

/** Cierra la compra: captura y la da por completa. Idempotente sobre una compra ya completa. */
export async function cerrarCompraDeEventos(desde: Element, id: string): Promise<ResultadoDelFlujo<CompraLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_COMPRA_DE_EVENTOS, 'cerrar', { consulta: { id } }));
}
