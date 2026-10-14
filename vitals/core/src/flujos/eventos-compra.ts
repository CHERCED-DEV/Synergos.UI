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
  /**
   * Si se está deshaciendo DESPUÉS de cobrar: hay plata del comprador sin devolver (ADR 0140, el cupón
   * endurecido). `Compensating` y `CompensationFailed` se llaman igual antes y después de capturar;
   * sin esto, «no se te cobró nada» podía ser falso. Un orquestador de antes no lo manda: `false`.
   */
  readonly porDevolver: boolean;
}

export function leerCompra(r: BffEventos.TicketPurchaseResponse): CompraLeida {
  return {
    id: r.id,
    estado: r.status,
    importe: r.total.amount,
    moneda: r.total.currency,
    gratis: r.total.amount === 0,
    apartadas: r.held.reduce((n, h) => n + h.quantity, 0),
    porDevolver: r.refundPending === true,
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

/**
 * Lo que la pantalla necesita de una cotización (ADR 0140, el cupón): cada importe en unidades MAYORES
 * de su moneda, como los publica el contrato. Lo calcula el servidor —Pricing el descuento, el
 * orquestador la comisión—; la pantalla sólo lo pinta.
 */
export interface CotizacionLeida {
  readonly subtotal: number;
  readonly descuento: number;
  readonly impuesto: number;
  readonly comision: number;
  /** Lo que abrir autorizaría con esas mismas líneas y ese mismo código. */
  readonly total: number;
  readonly moneda: string;
  /** El código que se cotizó, como lo recortó el orquestador; `null` sin código. */
  readonly codigo: string | null;
}

export function leerCotizacion(r: BffEventos.TicketQuoteResponse): CotizacionLeida {
  return {
    subtotal: r.subtotal.amount,
    descuento: r.discount.amount,
    impuesto: r.tax.amount,
    comision: r.serviceFee.amount,
    total: r.total.amount,
    moneda: r.total.currency,
    codigo: r.promotionCode,
  };
}

/**
 * Cotiza la compra SIN abrirla (ADR 0140, el cupón): el orquestador corre la fase que abre hasta
 * antes de apartar —revisar, cotizar contra Pricing con el código, sumar la comisión— y no guarda
 * nada. Es la vista previa honesta del descuento; abrir vuelve a cotizar entero, así que una
 * promoción que vence entre medias la rechaza abrir con su `code`. Sin llave: no crea nada.
 */
export async function cotizarCompraDeEventos(
  desde: Element,
  cuerpo: BffEventos.BuyTicketsRequest,
): Promise<ResultadoDelFlujo<CotizacionLeida>> {
  const r = await pedirAlFlujo(desde, FLUJO_COMPRA_DE_EVENTOS, 'cotizar', { cuerpo });
  return r.ok ? { ...r, valor: leerCotizacion(r.valor) } : r;
}

/** Cierra la compra: captura y la da por completa. Idempotente sobre una compra ya completa. */
export async function cerrarCompraDeEventos(desde: Element, id: string): Promise<ResultadoDelFlujo<CompraLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_COMPRA_DE_EVENTOS, 'cerrar', { consulta: { id } }));
}

/**
 * Cancela una compra EN CURSO por su id (ADR 0140, el cupón endurecido): el orquestador la compensa
 * —suelta lo apartado y anula la autorización— y contesta `Compensated` (o `Compensating`). Una compra
 * `Completed` contesta 409 `eventos.already_completed`: lo cobrado no se cancela, se devuelve (#183).
 * Sin llave: es la compra de ESE id, y cancelarla dos veces es lo mismo que una.
 */
export async function cancelarCompraDeEventos(desde: Element, id: string): Promise<ResultadoDelFlujo<CompraLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_COMPRA_DE_EVENTOS, 'cancelar', { consulta: { id } }));
}
