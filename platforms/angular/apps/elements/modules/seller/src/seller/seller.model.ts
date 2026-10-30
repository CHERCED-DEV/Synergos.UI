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
