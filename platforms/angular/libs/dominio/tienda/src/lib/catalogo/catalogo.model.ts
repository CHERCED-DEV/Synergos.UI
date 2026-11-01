/**
 * El catálogo de la tienda: productos, variantes, la ficha y la búsqueda por facetas (014-despiece-tienda, T008).
 *
 * La tienda habla el idioma del marketplace (producto, variante, reseña) del lado del catálogo; una vez elegido
 * producto y variante, pasa a ser una `SessionItem.selection` opaca del motor. TS puro, sin Angular.
 */

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
