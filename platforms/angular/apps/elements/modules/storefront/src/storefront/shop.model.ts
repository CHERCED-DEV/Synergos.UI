/**
 * Domain model for the Tienda vertical's <c>&lt;synergos-storefront&gt;</c> — a real
 * marketplace app (search · PLP · PDP · cart · checkout · orders), MercadoLibre-style.
 *
 * The storefront speaks the marketplace's product/variant/review language on the
 * catalogue side, but funnels every add-to-cart into the engine's
 * vertical-agnostic <c>SessionItem[]</c> cart behind a single <c>Pricing</c>, then
 * a single checkout. These types describe only the catalogue / pre-cart shapes;
 * once a product+variant is chosen it becomes an opaque <c>SessionItem.selection</c>
 * the engine never inspects.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The flow id the engine routes on — one strategy owns it. */
export const STOREFRONT_FLOW = 'storefront';

/** Every storefront cart line is a `product` kind for the engine. */
export const STOREFRONT_KIND: SessionItemKind = 'product';

/** The high-level phase / route the storefront is in (hash deep-linkable). */
export type StorefrontView =
  | 'home' // marketplace home: deals + featured categories
  | 'plp' // search results / category listing (SH-1)
  | 'pdp' // product detail (SH-2)
  | 'cart'
  | 'checkout' // SH-3 over the engine
  | 'confirmation'
  | 'account' // SH-4: mis compras + tracking + wishlist + mensajes + perfil
  | 'seller'; // SH-5: la cara B del vendedor (#32)

/** Quién está mirando: comprador (cara A) o vendedor (cara B). */
export type ShopRole = 'buyer' | 'seller';

/** Secciones de la consola del vendedor (#32). */
export type SellerView =
  | 'orders' // pedidos por atender
  | 'returns' // devoluciones: la cola que el endpoint `advance` esperaba
  | 'reviews' // la cola de moderación de #31, que se quedó sin sitio
  | 'messages'; // hilos con compradores

/** Account sections rendered inside SH-4. */
export type AccountSectionId = 'compras' | 'favoritos' | 'mensajes' | 'perfil';

/** Catalogue sort options for the PLP. Maps 1:1 to the API `sort` query param. */
export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'newest';

// ─── Catalogue: products, variants, facets ───────────────────────────────────

/**
 * One product card / summary as returned by `GET /api/shop/search`. `amount` is in
 * **major units** of `currency` (es-CO formatted in the view); the engine cart
 * stores minor units.
 */
export interface ShopProduct {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** Lead price in major units. */
  readonly amount: number;
  /** Optional pre-discount price (struck through) in major units. */
  readonly listAmount?: number;
  readonly currency: string;
  readonly brand: string;
  readonly category: string;
  /** Marketplace seller (cart groups lines per seller). Optional — single-seller shops omit it. */
  readonly seller?: string;
  readonly condition: ProductCondition;
  readonly freeShipping: boolean;
  readonly rating: number;
  readonly reviewCount: number;
  readonly inStock: boolean;
  /** Thumbnail/gallery image URLs (optional — view degrades to a placeholder). */
  readonly images: readonly string[];
  /** Short freeform chips (e.g. "Envío gratis", "12 cuotas"). */
  readonly badges: readonly string[];
}

/** New / used / refurbished — a canonical marketplace facet. */
export type ProductCondition = 'new' | 'used' | 'refurbished';

/** A selectable variant (color/size → its own SKU, price delta and stock). */
export interface ProductVariant {
  readonly variantId: string;
  readonly label: string;
  /** Variant attributes (e.g. `{ color: 'Azul', talla: 'M' }`). */
  readonly attributes: Readonly<Record<string, string>>;
  /** Total price for this variant in major units (already includes any delta). */
  readonly amount: number;
  readonly inStock: boolean;
  readonly stock: number;
}

/** A customer review for the PDP reviews block. */
export interface ProductReview {
  readonly id: string;
  readonly author: string;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  readonly date: string;
}

/** A buyer question (with optional seller answer) for the PDP Q&A block. */
export interface ProductQuestion {
  readonly id: string;
  readonly author: string;
  readonly question: string;
  readonly answer?: string;
  readonly date: string;
}

/** The full PDP payload as returned by `GET /api/shop/product/{id}`. */
export interface ProductDetail {
  readonly product: ShopProduct;
  readonly description: string;
  readonly variants: readonly ProductVariant[];
  readonly reviews: readonly ProductReview[];
  readonly questions: readonly ProductQuestion[];
  /**
   * Si ESTE visitante puede dejar una reseña. Lo decide el servidor con el mismo gate que
   * aplica el POST (autenticado + orden pagada de este producto). No se deduce en el cliente:
   * deducirlo sería adivinar, y ofrecer un formulario que va a rebotar con 403.
   */
  readonly canReview: boolean;
}

/** Lo que el comprador escribe. El autor NO va aquí: lo pone el servidor desde la sesión. */
export interface ReviewSubmission {
  readonly rating: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Resultado del envío de una reseña.
 *
 * Es un resultado TIPADO y no una excepción a secas, y no degrada a mock por diseño:
 * fingir una escritura que no ocurrió es peor que el error (ADR 0112). El motivo viaja
 * para que la UI diga la verdad — un 403 no se arregla volviendo a entrar, así que no
 * puede ofrecer login.
 */
export type ReviewSubmitResult =
  | {
      readonly ok: true;
      /**
       * Quedó ENCOLADA para revisión, no publicada (#31).
       *
       * Sale de un `202 Accepted`, y por eso el campo existe: `response.ok` es
       * cierto para todo 2xx, así que sin distinguirlos el acuse decía «ya está
       * publicada» **y recargaba la ficha** — quien escribió veía la confirmación
       * y una lista donde su reseña no estaba. El defecto #26 con la prueba de la
       * mentira en la misma pantalla.
       */
      readonly pending: boolean;
    }
  | { readonly ok: false; readonly reason: 'unauthenticated' | 'not-buyer' | 'invalid' | 'failed' };

/**
 * Resultado de reportar una reseña (#31).
 *
 * `already-reported` NO es un error de quien reporta: el servidor deduplica y la
 * respuesta honesta es «ya lo habíamos recibido», no «falló».
 */
export type ReviewReportResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'already-reported' | 'not-found' | 'failed';
    };

// ─── Cupones y descuentos (#29) ──────────────────────────────────────────────

/**
 * Un cupón aceptado por el servidor.
 *
 * `amountMinor` es NEGATIVO: entra tal cual como `PriceLine` del `breakdown`, que
 * el motor documenta como «can be negative for discounts» desde el primer día y
 * que ningún dominio había usado nunca.
 */
export interface ShopPromo {
  readonly code: string;
  /** Negativo, en unidades menores. */
  readonly amountMinor: number;
  /** Cómo se llama el descuento en el resumen: «Cupón BIENVENIDA10». */
  readonly label: string;
  /** Contexto opcional: «Válido hasta el 30 de septiembre». */
  readonly detail?: string;
}

/**
 * Resultado de validar un cupón. **Tipado y sin degradar a mock**: un descuento
 * fingido en el cliente es una promesa de plata que el checkout va a romper, y el
 * peor momento para descubrirlo es al pagar (regla 4 de `CLAUDE.md`).
 *
 * `shortfallMinor` sólo viaja con `minimum-not-met`, porque CUÁNTO FALTA es lo
 * único accionable de ese rechazo — decir «no llegas al mínimo» sin el número
 * deja a quien compra adivinando.
 */
export type ShopPromoResult =
  | { readonly ok: true; readonly promo: ShopPromo }
  | {
      readonly ok: false;
      readonly reason:
        | 'unknown'
        | 'expired'
        | 'minimum-not-met'
        | 'not-applicable'
        | 'already-used'
        | 'failed';
      readonly shortfallMinor?: number;
    };

// ─── Faceted search ──────────────────────────────────────────────────────────

/** A facet group (category / brand / condition…) with selectable values. */
export interface Facet {
  /** Stable key used in the search query (`category`, `brand`, `condition`). */
  readonly key: string;
  /** Human label for the facet group. */
  readonly label: string;
  readonly values: readonly FacetValue[];
  /**
   * Cómo se comporta la faceta al filtrar (`MultiSelect` | `SingleSelect` | `Threshold` |
   * `Range`), tal como la declara el descriptor del backend. El shell decide con esto si
   * pinta checkboxes o radios. Ausente = `MultiSelect`.
   */
  readonly kind?: string;
}

/** One selectable value within a facet group, with a result count. */
export interface FacetValue {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

/** `GET /api/shop/search` response. */
export interface SearchResult {
  readonly products: readonly ShopProduct[];
  readonly facets: readonly Facet[];
  /**
   * How many products match the filters IN TOTAL — not how many this page carries.
   *
   * The shell computes `pageCount = ceil(total / pageSize)`, so without this it falls back
   * to `items.length` and concludes there is a single page: the backend would serve page 1
   * of N and the pager would stay hidden, leaving the rest unreachable.
   */
  readonly total: number;
}

/** The active query the PLP drives the search with. */
export interface SearchCriteria {
  readonly q: string;
  readonly category: string;
  /** Selected facet values keyed by facet key (e.g. `{ brand: ['Sony'] }`). */
  readonly facets: Readonly<Record<string, readonly string[]>>;
  readonly sort: SortKey;
  readonly page: number;
}

// ─── Cart / checkout contract (API) ──────────────────────────────────────────

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

/** A past order from `GET /api/shop/orders`. */
export interface ShopOrder {
  readonly orderNumber: string;
  readonly date: string;
  readonly status: OrderStatus;
  readonly total: number;
  readonly currency: string;
  readonly items: readonly OrderLine[];
}

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
}

/**
 * Por qué se devuelve (#32).
 *
 * **Es un enum y no texto libre**, porque es lo que ORDENA la cola del vendedor:
 * «llegó dañado» es garantía y «cambié de opinión» es retracto, y son dos
 * negocios distintos con dos plazos distintos. Antes viajaba un literal fijo
 * —`'solicitud-comprador'`— así que los veinte reclamos decían lo mismo y la
 * cola era inatendible.
 */
export type ReturnReason = 'damaged' | 'defective' | 'not-as-described' | 'changed-mind';

/** El estado del reclamo en el vocabulario que emite el borde. */
export type ReturnStatus = 'abierto' | 'en-revision' | 'resuelto' | 'rechazado';

/** Un reclamo de devolución, tal como lo devuelve el borde. */
export interface ReturnCase {
  readonly claimId: string;
  readonly orderRef: string;
  /** `productId` o `productId/variantId` — lo compone el servidor. */
  readonly lineRef: string;
  readonly productName: string;
  readonly quantity: number;
  /** Ya formateado por el servidor: la UI no calcula dinero. */
  readonly refundAmountFormatted: string;
  /** El motivo tal cual lo guardó el servidor. */
  readonly reason: string;
  readonly status: ReturnStatus;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly note?: string;
}

/**
 * Resultado de pedir una devolución.
 *
 * **Tipado y sin degradar a mock**: el cliente inventaba un `claimId` cuando el
 * POST fallaba, así que el comprador se iba con un número de reclamo que no
 * existe en ninguna parte — y cuando reclame por él, nadie lo encontrará. Regla
 * 4 de `CLAUDE.md` sobre una escritura con dinero detrás.
 */
export type ReturnRequestResult =
  | { readonly ok: true; readonly claim: ReturnCase }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid' | 'failed';
      /** Lo que dijo el servidor, cuando lo dijo. Se enseña tal cual. */
      readonly detail?: string;
    };

/** A qué estado mueve el vendedor un reclamo. El vocabulario es el del borde. */
export type ReturnAdvance = 'approved' | 'rejected' | 'received' | 'refunded';

/** Resultado de avanzar un reclamo. Tampoco degrada: `refunded` mueve dinero. */
export type ReturnAdvanceResult =
  | { readonly ok: true; readonly claim: ReturnCase }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'forbidden' | 'not-found' | 'illegal' | 'failed';
      readonly detail?: string;
    };

// ─── Consola del vendedor (#32) ──────────────────────────────────────────────

/** Una opinión esperando decisión del vendedor. Gemela de la cola de #31. */
export interface ShopModerationItem {
  readonly id: string;
  readonly author: string;
  readonly productTitle: string;
  readonly rating: number;
  readonly body: string;
  readonly createdAt: string;
  /** `reported` ya está pública haciendo daño; `pending` no la ve nadie. */
  readonly reason: 'pending' | 'reported';
  readonly reportCount: number;
}

/** Resultado de decidir sobre una opinión. No degrada: ver #31. */
export type ShopModerationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'forbidden' | 'already-decided' | 'failed';
    };

/** Un pedido visto desde el lado de quien lo tiene que despachar. */
export interface SellerOrder {
  readonly orderRef: string;
  readonly orderNumber: string;
  readonly buyer: string;
  readonly date: string;
  readonly status: OrderStatus;
  readonly totalFormatted: string;
  readonly itemCount: number;
}

/** `GET /api/shop/seller/desk` — lo que el vendedor tiene por atender. */
export interface SellerDeskResult {
  readonly orders: readonly SellerOrder[];
  readonly returns: readonly ReturnCase[];
  readonly moderation: readonly ShopModerationItem[];
  readonly salesFormatted: string;
  readonly pendingShipments: number;
}

// ─── Post-venta / cuenta (contratos nuevos — backend en paralelo) ─────────────

/** One saved product from `GET /api/shop/wishlist`. */
export interface WishlistEntry {
  readonly productId: string;
  readonly title: string;
  /** Price in major units. */
  readonly amount: number;
  readonly currency: string;
  readonly image?: string;
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

/** `POST /api/shop/order/{ref}/return` response — a claim was opened. */
export interface ReturnReceipt {
  readonly claimId: string;
  readonly status: 'abierto' | 'en-revision' | 'resuelto';
}

/** One buyer↔seller thread from `GET /api/shop/messages` (mensajería v1). */
export interface MessageThread {
  readonly id: string;
  readonly subject: string;
  readonly counterpart: string;
  readonly lastMessage: string;
  readonly date: string;
  readonly unread: boolean;
}
