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
  | 'account'; // SH-4: mis compras + tracking + wishlist + mensajes + perfil

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
}

// ─── Faceted search ──────────────────────────────────────────────────────────

/** A facet group (category / brand / condition…) with selectable values. */
export interface Facet {
  /** Stable key used in the search query (`category`, `brand`, `condition`). */
  readonly key: string;
  /** Human label for the facet group. */
  readonly label: string;
  readonly values: readonly FacetValue[];
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
