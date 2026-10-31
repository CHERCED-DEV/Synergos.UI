/** La compra: el contrato de la ruta directa y el de la puerta (014-despiece-tienda, T008). */

// ─── Cart / checkout contract (API) ──────────────────────────────────────────

/**
 * La variante «Estándar» que la tienda inventa para un producto que llega sin variantes (004-tienda-compra, etapa 3):
 * `{producto}-default`. No es del catálogo: es el producto mismo, por los dos caminos de la compra.
 */
export function varianteSintetica(productId: string): string {
  return `${productId}-default`;
}

/** La variante que el catálogo conoce: vacía si es la sintética (014-despiece-tienda: la ruta directa la mandaba tal cual). */
export function varianteDelCatalogo(productId: string, variantId: string): string {
  const variante = variantId.trim();
  return variante === varianteSintetica(productId) ? '' : variante;
}

/** One line in the `POST /api/shop/checkout` request body. */
export interface CheckoutLine {
  readonly productId: string;
  readonly variantId: string;
  readonly qty: number;
}

/** Customer contact + shipping captured once for the whole order. */
export interface ShopCustomer {
  readonly name: string;
  readonly email: string;
  readonly address?: string;
  readonly city?: string;
}

/** `POST /api/shop/checkout` response — opens one PSP session for the cart. */
export interface CheckoutResult {
  readonly orderRef: string;
  readonly paymentSessionId: string;
  readonly amount: number;
  readonly currency: string;
}

/** `POST /api/shop/confirm` response — the order placed. */
export interface OrderConfirmation {
  readonly status: string;
  readonly orderNumber: string;
  readonly items: readonly ConfirmedLine[];
}

/** One confirmed line in the order summary. */
export interface ConfirmedLine {
  readonly productId: string;
  readonly title: string;
  readonly qty: number;
  readonly reference: string;
}

// ─── La compra por la puerta (004-tienda-compra, ADR 0140) ────────────────────

/**
 * Por dónde compra la tienda: la puerta (`tienda.compra`, el flujo declarado en su orquestador) o la ruta
 * directa (`/api/shop/checkout|confirm`). Lo DECLARA el CMS en `purchasePath`; las dos se conservan.
 */
export type CaminoDeCompra = 'puerta' | 'directa';

/**
 * El camino que viaja en el `config` (ADR 0140): la puerta SÓLO si el CMS lo declaró así; cualquier otra
 * cosa —o nada— es la ruta directa, la de siempre de la tienda.
 */
export function caminoDeLaCompra(camino: unknown): CaminoDeCompra {
  return camino === 'puerta' ? 'puerta' : 'directa';
}

/** Una línea de la orden de una compra de la puerta, como la anota el CMS (`GET /api/shop/compras/{id}`). */
export interface LineaDeLaOrdenDeLaPuerta {
  readonly productId: string;
  readonly variantId: string | null;
  readonly title: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}

/** La orden de una compra de la puerta, ya registrada por el CMS: pagada si el orquestador la completó. */
export interface OrdenDeLaPuerta {
  readonly orderRef: string;
  readonly orderNumber: string;
  /** El estado de la orden del CMS: `Pending`, `Paid` o `Cancelled`. */
  readonly status: string;
  readonly total: number;
  readonly currency: string;
  readonly items: readonly LineaDeLaOrdenDeLaPuerta[];
}

/** Una compra de la puerta del miembro sin resolver, según el servidor (`GET /api/shop/compras/pendientes`). */
export interface CompraPendienteDelServidor {
  readonly id: string;
  readonly numero: string;
  readonly total: number;
  readonly moneda: string;
  readonly estado: string;
}
