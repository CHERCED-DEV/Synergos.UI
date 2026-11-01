/** «Mis compras» y el seguimiento de un pedido (014-despiece-tienda, T008). */

/** A past order from `GET /api/shop/orders`. */
export interface ShopOrder {
  readonly orderNumber: string;
  /**
   * Con lo que el servidor busca el pedido (`/order/{ref}/tracking`, `/return`): la referencia, no el número que ve
   * quien compró. Son distintos en los dos caminos (`ord_…`/`SYN-…` en la directa, la saga/`ABCD1234` en la puerta);
   * pedir por el número daba 404 y la pantalla se quedaba sin seguimiento ni devoluciones.
   */
  readonly orderRef: string;
  readonly date: string;
  readonly status: OrderStatus;
  readonly total: number;
  readonly currency: string;
  readonly items: readonly OrderLine[];
}

/**
 * Lo que se sabe de «Mis compras» (004-tienda-compra, etapa 3): la lista que dio el servidor, o POR QUÉ no la hay.
 * Antes un fallo devolvía los pedidos de ejemplo (`ORD-2026-00481`…) y la persona veía compras que no hizo. Sin sesión
 * (el servidor contestó 401) se pide entrar; con la lectura caída se dice. Se degrada por ausencia, no se inventa.
 */
export type LecturaDeCompras =
  | { readonly estado: 'leidas'; readonly pedidos: readonly ShopOrder[] }
  | { readonly estado: 'sin-sesion' }
  | { readonly estado: 'caida' };

/** Coarse fulfilment status of a past order. */
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/** One line in a past order. */
export interface OrderLine {
  readonly title: string;
  readonly qty: number;
  readonly amount: number;
  /**
   * Identificador del producto de esta línea (#32).
   *
   * **Sin esto no se puede devolver.** El borde exige `lineId` y la UI no lo
   * tenía en el modelo, así que mandaba el cuerpo incompleto y recibía 400 —
   * pero el cliente degradaba a mock y el comprador veía «Reclamo abierto» con
   * un número inventado. El backend emitía `productId` y `variantId` desde
   * siempre; lo que faltaba era leerlos.
   */
  readonly productId: string;
  readonly variantId?: string;
  /**
   * Si se puede pedir la devolución de ESTA línea (#34).
   *
   * **Lo decide el SERVIDOR con el mismo gate que aplica el POST**, igual que
   * `ProductDetail.canReview`. La UI lo deducía de `order.status`, y esa copia se
   * desvió hasta pedir estados que el dominio no emite —`shipped`, `delivered`—,
   * con lo que el botón quedó inalcanzable contra un servidor real (#33). No se
   * desvió por descuido: se desvió porque era una copia.
   *
   * Ausente = NO se puede. Ofrecer lo que el servidor no autorizó es prometer
   * algo que va a rebotar.
   */
  readonly canReturn: boolean;
  /**
   * Por qué no, cuando no. `order-not-paid` · `line-not-in-order` ·
   * `already-open` · `order-not-found`. Con un booleano a secas la UI tendría que
   * adivinar el motivo, que es el mismo error con otra forma.
   */
  readonly returnBlock?: string;
}

/** One shipment stage from `GET /api/shop/order/{ref}/tracking`. */
export interface ShipmentStage {
  readonly id: string;
  readonly label: string;
  readonly date?: string;
  readonly description?: string;
  readonly state: 'done' | 'current' | 'pending';
}

/** `GET /api/shop/order/{ref}/tracking` response. */
export interface OrderTracking {
  readonly orderRef: string;
  readonly carrier?: string;
  readonly stages: readonly ShipmentStage[];
}
