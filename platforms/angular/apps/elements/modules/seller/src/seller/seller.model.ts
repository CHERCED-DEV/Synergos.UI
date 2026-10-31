/**
 * Domain model for the Tienda vertical's <c>&lt;synergos-seller&gt;</c> — the
 * seller-side console (cara B) of the marketplace: KPIs, ventas, publicaciones,
 * devoluciones, reputación, publicar producto y mensajería con compradores.
 *
 * Everything here describes API shapes only — the component renders these
 * through the domain-free shells (`SH-5 syn-console-shell`,
 * `SH-6 syn-authoring-wizard`, `SH-7 syn-message-center`). No business data is
 * hardcoded: every collection comes from the shop API with visible mock
 * degradation while an endpoint is not yet wired.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised and unit-tested.
 */

/** Top-level view of the seller console. */
export type SellerView = 'panel' | 'publicar' | 'mensajes';

/** Sections of the SH-5 console (dashboard). */
export type SellerSectionId = 'ventas' | 'publicaciones' | 'devoluciones' | 'reputacion';

// ─── Summary / KPIs ──────────────────────────────────────────────────────────

/** How a raw KPI value should be formatted by the view (es-CO). */
export type SellerKpiUnit = 'currency' | 'count' | 'rating' | 'percent';

/** One raw KPI metric from `GET /api/shop/seller/summary` (values unformatted). */
export interface SellerKpiMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: SellerKpiUnit;
  /** Period delta in percent points (sign carries the trend). */
  readonly delta?: number;
  /** Secondary line under the value (e.g. "vs. mes anterior"). */
  readonly hint?: string;
}

/** Reputation metrics for the Reputación section. */
export interface SellerReputation {
  /** Average score 0–5. */
  readonly score: number;
  /** Level label as the platform names it (comes from the API). */
  readonly level: string;
  /** % of orders delivered on time. */
  readonly onTimeRate: number;
  /** % of orders that ended in a claim. */
  readonly claimRate: number;
  /** % of buyer questions answered. */
  readonly responseRate: number;
}

/** `GET /api/shop/seller/summary` response. */
export interface SellerSummary {
  readonly kpis: readonly SellerKpiMetric[];
  readonly reputation: SellerReputation;
}

// ─── Ventas (orders) ─────────────────────────────────────────────────────────

/** Coarse fulfilment status of an order (same ladder as the buyer side). */
export type SellerOrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/** One line inside a sale. */
export interface SellerOrderLine {
  readonly title: string;
  readonly qty: number;
  readonly amount: number;
}

/** One sale from `GET /api/shop/orders` (seller view). */
export interface SellerOrder {
  readonly orderNumber: string;
  readonly date: string;
  readonly buyer: string;
  readonly status: SellerOrderStatus;
  /** Total in major units of `currency`. */
  readonly total: number;
  readonly currency: string;
  readonly items: readonly SellerOrderLine[];
}

/** The forward ladder the "avanzar envío" action walks. */
export const ORDER_STATUS_LADDER: readonly SellerOrderStatus[] = [
  'paid',
  'preparing',
  'shipped',
  'delivered',
];

// ─── La bandeja del personal (013-seller-operaciones, T012) ──────────────────

/** Las etapas del despacho: las del seguimiento que lee el comprador. */
export type EtapaDelDespacho = 'paid' | 'preparing' | 'shipped' | 'delivered';

/** Las etapas, en orden. */
export const ETAPAS_DEL_DESPACHO: readonly EtapaDelDespacho[] = ['paid', 'preparing', 'shipped', 'delivered'];

/** Una línea del pedido, con su monto formateado por el servidor. */
export interface LineaDelPedido {
  readonly title: string;
  readonly qty: number;
  readonly amount: number;
  readonly amountFormatted: string;
}

/** Un pedido pagado de la tienda, como lo lee el personal (`GET seller/orders`). */
export interface PedidoDeLaTienda {
  /** En la puerta, el id de la saga de la compra; es lo que abre los actos. */
  readonly orderRef: string;
  /** El que ve el comprador y el que dice el aviso. */
  readonly orderNumber: string;
  /** El instante del pedido, ISO-8601: se pinta en la zona del sitio. */
  readonly fecha: string;
  /** El nombre de quien compró: el correo no llega a la bandeja. */
  readonly comprador: string;
  /** Lo dice el servidor. */
  readonly camino: 'puerta' | 'directa';
  readonly etapa: EtapaDelDespacho;
  readonly total: number;
  readonly totalFormatted: string;
  readonly moneda: string;
  readonly lineas: readonly LineaDelPedido[];
  /** Lo que se puede pedir ahora: la consola no lo deduce. */
  readonly actos: readonly string[];
  readonly motivoSinActos: string | null;
}

/** Un acto del personal sobre un pedido (013-seller-operaciones, R4): lo que el servidor pone en `actos`. */
export type ActoDelDespacho = 'preparar' | 'enviar' | 'entregar';

export const ACTOS_DEL_DESPACHO: readonly ActoDelDespacho[] = ['preparar', 'enviar', 'entregar'];

/** La guía más larga que acepta el acto de enviar, en una línea (la misma del servidor). */
export const GUIA_MAXIMA = 80;

/**
 * Lo que dejó un acto (T021): el pedido como lo dejó el servidor —nulo si contestó que sí con una forma que no se
 * entiende—, o que no se hizo (#77) y por qué: la sesión, el permiso, un rechazo con su código y la etapa en que sigue,
 * o que no se pudo ahora (la red, un 5xx o un transitorio), sin que nada cambiara.
 */
export type ResultadoDelActo =
  | { readonly hecho: true; readonly pedido: PedidoDeLaTienda | null }
  | {
      readonly hecho: false;
      readonly por: 'sin-sesion' | 'sin-permiso' | 'rechazo' | 'caida';
      /** El código del servidor (`fulfillment.transition_not_allowed`, `tienda.acto_fuera_de_orden`…), si lo mandó. */
      readonly codigo: string | null;
      /** La etapa en que sigue el pedido, si el servidor la dijo. */
      readonly etapa: EtapaDelDespacho | null;
    };

// ─── La cola de devoluciones del personal (013-seller-operaciones, T025) ─────

/** El estado EXACTO de una devolución, como lo dice `GET seller/returns`: el personal decide con éste, no con el rótulo. */
export type EstadoDeLaDevolucion = 'Requested' | 'Approved' | 'Received' | 'Refunded' | 'Rejected';

/** Si un valor es un estado exacto de devolución: los de `ShopReturnStatus` del CMS. */
export function esEstadoDeDevolucion(value: unknown): value is EstadoDeLaDevolucion {
  return value === 'Requested' || value === 'Approved' || value === 'Received' || value === 'Refunded' || value === 'Rejected';
}

/** Lo que el personal le pide a una devolución: el `status` que lee `POST return/{rmaId}/advance` (`ReturnAdvanceBody`). */
export type MovimientoDeLaDevolucion = 'approved' | 'rejected' | 'received' | 'refunded';

/** Una devolución de la cola de la tienda (`VendedorDeLaTiendaController.DevolucionDto`, T024). */
export interface DevolucionDeLaTienda {
  readonly rmaId: string;
  readonly orderRef: string;
  /** El número del pedido; nulo si su orden no se encuentra. */
  readonly orderNumber: string | null;
  /** Por dónde volverá la plata; nulo si su orden no se encuentra. */
  readonly camino: 'puerta' | 'directa' | null;
  readonly producto: string;
  readonly cantidad: number;
  readonly motivo: string;
  /** Lo que se devolvería: el total de la línea de la orden, con su texto del servidor. */
  readonly monto: number;
  readonly montoFormatted: string;
  readonly moneda: string;
  readonly estado: EstadoDeLaDevolucion;
  readonly nota: string | null;
  /** ISO-8601: se pinta en la zona del sitio. */
  readonly solicitada: string;
  readonly actualizada: string;
}

/** Lo que dejó mover una devolución: su estado nuevo, o que no se movió (#77) y el motivo que dio el servidor. */
export type ResultadoDelMovimiento =
  | { readonly hecho: true; readonly estado: EstadoDeLaDevolucion | null }
  | {
      readonly hecho: false;
      readonly por: 'sin-sesion' | 'sin-permiso' | 'rechazo' | 'caida';
      /** El motivo del servidor (un reembolso que no salió dice por qué); nulo si no lo dio. */
      readonly motivo: string | null;
    };

/** Una página de la bandeja, con las cuentas por etapa de la tienda entera (no de la página ni del filtro). */
export interface BandejaDeLaTienda {
  readonly pedidos: readonly PedidoDeLaTienda[];
  readonly pagina: number;
  readonly porPagina: number;
  /** Cuántos hay con el filtro, en todas las páginas. */
  readonly total: number;
  readonly cuentas: Readonly<Record<EtapaDelDespacho, number>>;
  /** Las compras de la puerta que el servidor no alcanzó a confirmar en esta lectura. */
  readonly sinConciliar: number;
}

/** A dónde va un envío. */
export interface DestinoDelEnvio {
  readonly line1: string | null;
  readonly line2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly contact: string | null;
}

/** Un paso del envío: su estado, su nota (la guía) y cuándo pasó. */
export interface EventoDelEnvio {
  readonly estado: string;
  readonly nota: string | null;
  readonly fecha: string;
}

/** El envío de un pedido; en la directa, sólo su destino. */
export interface EnvioDelPedido {
  readonly destino: DestinoDelEnvio | null;
  readonly transportadora: string | null;
  readonly estado: string | null;
  readonly eventos: readonly EventoDelEnvio[];
}

/** Por qué un pedido no trae su envío entero. */
export type MotivoSinEnvio = 'sin_direccion' | 'sin_envio' | 'envio_no_disponible';

/** El detalle de un pedido (`GET seller/orders/{orderRef}`): el pedido como en la bandeja, más su envío. */
export interface DetalleDelPedido extends PedidoDeLaTienda {
  readonly envio: EnvioDelPedido | null;
  readonly motivoSinEnvio: MotivoSinEnvio | null;
}

// ─── Publicaciones (catalogue as the seller sees it) ─────────────────────────

/** Lifecycle of a listing. */
export type SellerListingStatus = 'activa' | 'pausada' | 'agotada';

/** One listing from `GET /api/shop/seller/products`. */
export interface SellerListing {
  readonly id: string;
  readonly title: string;
  readonly sku: string;
  /** Price in major units of `currency`. */
  readonly amount: number;
  readonly currency: string;
  readonly stock: number;
  readonly status: SellerListingStatus;
  /** Open buyer questions on this listing. */
  readonly questionsOpen: number;
}

// ─── Devoluciones (RMA) ──────────────────────────────────────────────────────

/** Lifecycle of a return/claim as the seller works the queue. */
export type SellerReturnStatus = 'abierto' | 'en-revision' | 'aprobado' | 'rechazado';

/** One RMA from `GET /api/shop/returns`. */
export interface SellerReturn {
  readonly rmaId: string;
  readonly orderNumber: string;
  readonly productTitle: string;
  readonly reason: string;
  readonly date: string;
  readonly status: SellerReturnStatus;
}

/** `POST /api/shop/return/{rmaId}/advance` verbs. */
export type SellerReturnAction = 'approve' | 'reject';

// ─── Publicar producto ───────────────────────────────────────────────────────

/** `POST /api/shop/seller/product` request body (built from the wizard draft). */
export interface SellerPublishRequest {
  readonly title: string;
  readonly brand: string;
  readonly category: string;
  readonly description: string;
  readonly condition: 'new' | 'used' | 'refurbished';
  readonly images: readonly string[];
  /** Price in major units of `currency`. */
  readonly amount: number;
  readonly currency: string;
  readonly stock: number;
}

/** `POST /api/shop/seller/product` response. */
export interface SellerPublishReceipt {
  readonly productId: string;
  readonly status: string;
}

// ─── Mensajes / preguntas ────────────────────────────────────────────────────

/** One message inside a thread. */
export interface SellerMessage {
  readonly id: string;
  readonly from: 'buyer' | 'seller';
  readonly body: string;
  readonly date: string;
  /**
   * La respuesta NO salió (UI#92): se queda en el hilo, marcada y sin fecha de envío, para
   * reintentarla sin volver a teclearla. Nunca la pone el servidor — es estado de esta
   * pestaña, como el `failed` de los mensajes de EHR (#111).
   */
  readonly failed?: boolean;
}

/** One buyer↔seller thread from `GET /api/shop/messages`. */
export interface SellerThread {
  readonly id: string;
  readonly subject: string;
  readonly counterpart: string;
  readonly date: string;
  readonly unread: boolean;
  readonly messages: readonly SellerMessage[];
}
