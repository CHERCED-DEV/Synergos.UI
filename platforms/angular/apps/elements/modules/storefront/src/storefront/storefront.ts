import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HostIdentityService } from '@synergos/core';
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
  type SessionItem,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  CompareSelection,
  CompareTableComponent,
  type CompareAttribute,
  type CompareCandidate,
  type CompareRejection,
  type CompareTableConfig,
  CartShellComponent,
  type CartAction,
  type CartGroup,
  type CartLine,
  type CartQuantityChange,
  type CartShellConfig,
  type CartSummaryRow,
  ReviewPanelComponent,
  type ReviewBlockedReason,
  type ReviewDraft,
  type ReviewEntry,
  type ReviewPanelConfig,
  type ReviewSummary,
  ConfirmationShellComponent,
  type ConfirmationAction,
  type ConfirmationShellConfig,
  type ConfirmationStep,
  CheckoutWizardComponent,
  ConsoleShellComponent,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  DetailShellComponent,
  DiscoveryShellComponent,
  TrackingTimelineComponent,
  type AccountShellConfig,
  type CheckoutWizardConfig,
  AVISOS_DE_UN_COBRO,
  type CheckoutWizardResult,
  type DetailMedia,
  type DetailSpec,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type TrackingStage,
} from '@synergos/shells';
import {
  LiveAnnouncerService,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  monogram as monogramOf,
  omitUndefinedProperties,
  resolveConfigValue,
  PromoCodeComponent,
  type AppliedPromo,
  type PromoCodeConfig,
  type PromoRejection,
  SynSkeletonComponent,
  SynErrorStateComponent,
  SynStatusBannerComponent,
} from '@synergos/shared';
import type { StorefrontProps } from '@synergos/contracts';
import { ShopApiClient } from './shop-api.client';
import { diaDeLaTienda, momentoDeLaTienda } from './fechas-de-la-tienda';
import {
  CODIGO_COBRO_DEVUELTO,
  CODIGO_COMPRA_SIN_RESOLVER,
  CODIGO_DEMASIADOS_CODIGOS,
  CODIGO_SIN_SABER,
  PREFIJO_DEL_CUPON,
  caminoDeLaCompraEnCurso,
  caminoDeLaPendiente,
  compraDeLaSesion,
  compraPendiente,
  cuponDeLaSesion,
  llaveRetenida,
  sinCompraPendiente,
  type ShopSelectionPayload,
} from './shop-fulfillment.strategy';
import {
  FLUJO_DE_LA_COMPRA,
  abrirCompraDeTienda,
  cancelarCompraDeTienda,
  cotizarCompraDeTienda,
  cuerpoDeLaCompra,
  direccionDeEnvio,
} from './tienda-compra';
import {
  STOREFRONT_FLOW,
  caminoDeLaCompra,
  type AccountSectionId,
  type CaminoDeCompra,
  type CompraPendienteDelServidor,
  type LecturaDeCompras,
  type MessageThread,
  type ProductCondition,
  type ProductDetail,
  type ProductVariant,
  type OrderLine,
  type ReturnAdvance,
  type ReturnCase,
  type ReturnReason,
  type ReturnStatus,
  type SellerDeskResult,
  type SellerOrder,
  type SellerView,
  type ShopModerationItem,
  type ShopRole,
  type SearchCriteria,
  type ShopCustomer,
  type ShopOrder,
  type ShopProduct,
  type ShopPromo,
  type SortKey,
  type StorefrontView,
  type WishlistEntry,
} from './shop.model';
import {
  AVISOS_GENERADOS,
  aMenores,
  baseDeRuta,
  clasificarRechazo,
  desdeMenores,
  formatearImporte,
  mismaRuta,
  segmentosDeRuta,
  t,
} from '@synergos/vitals-core';

/**
 * Runtime config for the CMS element <c>elementSynStorefront</c>.
 *
 * Storefront **v2** — the Tienda buyer-side app (Ola 1 doc 21) rebuilt as the
 * **first consumer of the reusable shell catalogue** `@synergos/shells`:
 * SH-1 `syn-discovery-shell` (PLP), SH-2 `syn-detail-shell` (PDP), SH-3
 * `syn-checkout-wizard` (checkout over the engine) and SH-4 `syn-account-shell`
 * (+ `syn-tracking-timeline`) for mis compras / tracking / wishlist / mensajes.
 * The storefront only contributes domain data, templates and its
 * `ShopFulfillmentStrategy` — the shells stay domain-free (contrato D3).
 */
export type StorefrontConfig = Partial<StorefrontProps>;

/** Typed event map for the transaction bus (storefront ↔ cart ↔ checkout ↔ IA). */
interface StorefrontBus extends Record<string, unknown> {
  readonly cartUpdated: { readonly count: number; readonly total: number };
  readonly orderconfirmed: { readonly orderRef: string; readonly orderNumber: string };
}

/** One seller group of cart lines (carrito agrupado por vendedor). */
interface CartSellerGroup {
  readonly seller: string;
  readonly items: readonly SessionItem[];
  readonly totalMinor: number;
}

const DEFAULT_SCOPE = 'storefront';
const DEFAULT_HEADING = 'Todo lo que buscas, en un solo lugar';
const DEFAULT_SUBHEADING = 'Envíos a todo el país · hasta 36 cuotas · compra protegida';
const DEFAULT_SELLER_GROUP = 'Synergos Market';
const SESSION_TTL_MS = 30 * 60 * 1000;
const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
];
const CLEAN_CRITERIA: DiscoveryCriteria = { term: '', facets: {}, sort: 'relevance', page: 1 };

const SELLER_SECTIONS: readonly SellerView[] = ['orders', 'returns', 'reviews', 'messages'];

/**
 * El orden de la cola de devoluciones (#32).
 *
 * Lo que espera al vendedor va arriba; lo cerrado, abajo. Ordenar por fecha
 * dejaría un reclamo sin abrir debajo de tres ya resueltos.
 */
const RETURN_QUEUE_ORDER: Readonly<Record<ReturnStatus, number>> = {
  abierto: 0,
  'en-revision': 1,
  resuelto: 2,
  rechazado: 3,
};

/**
 * Qué se le dice a quien compró según el motivo que dio el SERVIDOR (#34).
 *
 * `order-not-paid` y `order-not-found` se quedan en blanco a propósito: a quien
 * canceló o a quien mira un pedido que no existe no hay nada útil que contarle
 * sobre devoluciones. `line-not-in-order` tampoco — es un desajuste nuestro, no
 * algo que esa persona pueda resolver.
 */
const RETURN_BLOCK_LABELS: Readonly<Record<string, string>> = {
  'already-open': 'Ya hay un reclamo abierto para este producto.',
};

/** Lo que se dice cuando no se pudo mover el reclamo. */
const ADVANCE_ERRORS: Readonly<Record<string, string>> = {
  unauthenticated: 'Inicia sesión para gestionar devoluciones.',
  forbidden: 'No tienes permiso para mover este reclamo.',
  'not-found': 'Ese reclamo ya no existe.',
  illegal: 'Ese cambio de estado no es posible desde el estado actual.',
  failed: 'No pudimos guardar el cambio. El reclamo sigue como estaba.',
};

/**
 * La etapa de entrega del pipeline de la Tienda (#33).
 *
 * El id lo fija `StubOrderTrackingService.ShopPipeline` —«paid → preparing →
 * shipped → delivered»— y llega tal cual en `GET /order/{ref}/tracking`.
 */
const DELIVERED_STAGE = 'delivered';

/** Lo que se dice según por qué rebotó la devolución (#32). */
const RETURN_ERRORS: Readonly<Record<string, string>> = {
  unauthenticated: 'Inicia sesión para pedir una devolución.',
  // Sin oferta de login: la sesión no es el problema (ADR 0112).
  forbidden: 'Esta compra no está a tu nombre.',
  'not-found': 'No encontramos ese pedido.',
  invalid: 'No se puede devolver esa línea. Revisa el pedido.',
  failed: 'No pudimos abrir el reclamo. Intenta de nuevo.',
};

/** Los motivos, con el nombre que entiende quien compra. */
const RETURN_REASON_LABELS: Readonly<Record<ReturnReason, string>> = {
  damaged: 'Llegó dañado',
  defective: 'No funciona',
  'not-as-described': 'No es lo que decía la publicación',
  'changed-mind': 'Cambié de opinión',
};

/** Los cuatro, en el orden en que se ofrecen. */
const RETURN_REASONS: readonly ReturnReason[] = [
  'damaged',
  'defective',
  'not-as-described',
  'changed-mind',
];

/**
 * La línea, tal como la nombra el borde: `productId` o `productId/variantId`
 * (`StubReturnService:163`). Se compone acá porque el `lineId` que se manda tiene
 * que poder cruzarse con el `lineRef` que vuelve.
 */
function lineRefOf(line: OrderLine): string {
  return line.variantId ? `${line.productId}/${line.variantId}` : line.productId;
}

/**
 * La variante de un producto que no trae ninguna: él mismo, «Estándar». La usan el agregado rápido del catálogo y la
 * ficha (004-tienda-compra, etapa 3): los productos del CMS llegan con `variants: []`, y la ficha no agregaba nada.
 */
function varianteEstandar(product: ShopProduct): ProductVariant {
  return {
    variantId: `${product.id}-default`,
    label: 'Estándar',
    attributes: {},
    amount: product.amount,
    inStock: true,
    stock: 99,
  };
}

/** Lo que el comprador está a punto de mandar. */
interface ReturnDraft {
  readonly orderRef: string;
  /** Con lo que el servidor busca el pedido; `orderRef` es la clave de la pantalla (el número). */
  readonly apiRef: string;
  readonly line: OrderLine;
  readonly reason: ReturnReason;
}

/**
 * El rótulo de la condición, en UN sitio.
 *
 * Estaba escrito tres veces como ternario anidado —el eyebrow de la PDP, su ficha
 * técnica y, al llegar SH-14, la fila de comparación—, así que el tercer sitio
 * habría dicho «Reacondicionado» el día que los dos primeros dijeran otra cosa.
 */
const CONDITION_LABELS: Readonly<Record<ProductCondition, string>> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
};
const ACCOUNT_SECTIONS: readonly AccountSectionId[] = [
  'compras',
  'favoritos',
  'mensajes',
  'perfil',
];

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeStorefrontConfig(value: StorefrontConfig): StorefrontConfig {
  return omitUndefinedProperties<StorefrontProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    apiBase: coerceTrimmedStringInput(value.apiBase),
    purchasePath: coerceTrimmedStringInput(value.purchasePath),
    shippingCountry: coerceTrimmedStringInput(value.shippingCountry),
    zonaHoraria: coerceTrimmedStringInput(value.zonaHoraria),
  });
}

/**
 * El parámetro del enlace del aviso de una compra por la puerta (`?compra={id}`): lo GENERA N3 desde
 * `Synergos:Puerta:Flujos:tienda.compra:Aviso:Ruta` del CMS (`AVISOS_GENERADOS`), así que un cambio allá
 * rompe la compilación acá; la tabla escrita a mano no hace falta tocarla.
 */
export const PARAMETRO_DE_LA_COMPRA = AVISOS_GENERADOS[FLUJO_DE_LA_COMPRA].parametro;

/** La compra que trae el enlace del aviso, si la trae: de la CONSULTA, nunca del hash. */
export function compraDelEnlace(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return new URLSearchParams(window.location.search).get(PARAMETRO_DE_LA_COMPRA)?.trim() ?? '';
}

/** La consulta de la página sin el parámetro de la compra. */
function consultaSinLaCompra(): string {
  const consulta = new URLSearchParams(window.location.search);
  consulta.delete(PARAMETRO_DE_LA_COMPRA);
  const texto = consulta.toString();
  return texto ? `?${texto}` : '';
}

/**
 * Saca la compra del enlace de la URL una vez leída (`history.replaceState`): recargar no vuelve a abrirla,
 * y la página no queda diciendo «¡compra confirmada!» en cada F5.
 */
function olvidarLaCompraDelEnlace(): void {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has(PARAMETRO_DE_LA_COMPRA)) {
    return;
  }
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${consultaSinLaCompra()}${window.location.hash}`);
}

/** El motivo del control del cupón por el `code` con que `cotizar` lo rechazó. */
function motivoDelCupon(code: string): PromoRejection {
  switch (code) {
    case 'pricing.promotion_not_found':
      return 'unknown';
    case 'pricing.promotion_expired':
      return 'expired';
    case 'pricing.promotion_currency_mismatch':
      return 'not-applicable';
    case CODIGO_DEMASIADOS_CODIGOS:
      return 'too-many-attempts';
    default:
      return 'failed';
  }
}

/** La clase de un motivo de la estrategia (sólo hay su `code`). */
function claseDelMotivo(motivo: string): ReturnType<typeof clasificarRechazo> {
  return clasificarRechazo({ code: motivo, status: 0, transient: false, detail: '', origen: 'servidor', extra: {} });
}

let storefrontInstanceId = 0;

@Component({
  selector: 'sg-storefront',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    DiscoveryShellComponent,
    DetailShellComponent,
    CheckoutWizardComponent,
    AccountShellComponent,
    ConfirmationShellComponent,
    CartShellComponent,
    CompareTableComponent,
    ConsoleShellComponent,
    SynStatusBannerComponent,
    ReviewPanelComponent,
    PromoCodeComponent,
    TrackingTimelineComponent,
    SynSkeletonComponent,
    SynErrorStateComponent,
  ],
  templateUrl: './storefront.html',
  styleUrl: './storefront.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-storefront' },
})
export class StorefrontElementComponent implements OnInit {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<StorefrontBus>>(TransactionEventBusService);
  readonly #api = inject(ShopApiClient);
  readonly #identity = inject(HostIdentityService);
  readonly #announcer = inject(LiveAnnouncerService);
  /** El `<synergos-storefront>` de ESTA compra: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly #host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<StorefrontConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<StorefrontProps>(sanitizeStorefrontConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  /**
   * Dónde vive la API. Sin ella no se llama a nada y cada vista degrada a su muestra, visible:
   * no hay una base de respaldo compilada (ADR 0137).
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  /**
   * La moneda de lo que se muestra: la que trae cada precio de la API. No es configuración: sería
   * una segunda fuente para un dato del precio. Sin datos todavía, vacía (`formatPrice` pinta el
   * número solo).
   */
  readonly currency = computed(() => this.detail()?.product.currency || this.products()[0]?.currency || '');
  readonly scope = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.scopeInput()),
      undefined,
      DEFAULT_SCOPE,
    ),
  );
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      DEFAULT_HEADING,
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      DEFAULT_SUBHEADING,
    ),
  );

  readonly instanceId = (storefrontInstanceId += 1);
  readonly fieldId = `syn-storefront-${this.instanceId}`;
  readonly sortOptions = SORT_OPTIONS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly cartchange = output<number>();
  readonly orderconfirmed = output<{ orderRef: string; orderNumber: string }>();

  // ─── Router (signals + hash deep-links) ─────────────────────────────────────
  readonly view = signal<StorefrontView>('home');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly cartOpen = signal(false);
  #suppressedHash = '';

  // ─── Search / PLP (SH-1 inputs) ─────────────────────────────────────────────
  readonly criteria = signal<DiscoveryCriteria>(CLEAN_CRITERIA);
  readonly products = signal<readonly ShopProduct[]>([]);
  /**
   * Total matches across all pages — feeds the shell's `[total]`, which is what turns
   * `pageCount` into something other than 1 once the backend starts paginating.
   */
  readonly total = signal(0);
  readonly discoveryFacets = signal<readonly DiscoveryFacet[]>([]);
  readonly searched = signal(false);
  readonly homeTerm = signal('');

  // ─── Home (derived rails) ────────────────────────────────────────────────────
  readonly deals = computed(() => this.products().filter((product) => product.listAmount).slice(0, 4));
  readonly topRated = computed(() =>
    [...this.products()].sort((a, b) => b.rating - a.rating).slice(0, 4),
  );
  readonly homeCategories = computed(
    () => this.discoveryFacets().find((facet) => facet.key === 'category')?.values ?? [],
  );

  // ─── PDP (SH-2 inputs) ──────────────────────────────────────────────────────
  readonly detail = signal<ProductDetail | null>(null);
  readonly selectedVariantId = signal('');
  readonly pdpQuantity = signal(1);

  readonly pdpMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.detail();
    if (!detail) {
      return [];
    }
    return detail.product.images.map((url) => ({ url, alt: detail.product.title }));
  });

  readonly pdpEyebrow = computed(() => {
    const product = this.detail()?.product;
    if (!product) {
      return '';
    }
    return `${CONDITION_LABELS[product.condition]} · ${product.brand}`;
  });

  readonly pdpSpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.detail();
    if (!detail) {
      return [];
    }
    const product = detail.product;
    const specs: DetailSpec[] = [
      { label: 'Marca', value: product.brand || '—' },
      { label: 'Categoría', value: product.category || '—' },
      { label: 'Condición', value: CONDITION_LABELS[product.condition] },
      { label: 'Envío', value: product.freeShipping ? 'Gratis a todo el país' : 'Con costo' },
    ];
    if (product.seller) {
      specs.push({ label: 'Vendido por', value: product.seller });
    }
    const variant = this.selectedVariant();
    if (variant) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        specs.push({ label: key, value });
      }
    }
    return specs;
  });

  readonly related = computed(() => {
    const current = this.detail()?.product.id;
    return this.products().filter((product) => product.id !== current).slice(0, 4);
  });

  readonly selectedVariant = computed<ProductVariant | null>(() => {
    const detail = this.detail();
    if (!detail) {
      return null;
    }
    const id = this.selectedVariantId();
    return detail.variants.find((variant) => variant.variantId === id) ?? detail.variants[0] ?? null;
  });

  readonly pdpPriceLabel = computed(() => {
    const detail = this.detail();
    if (!detail) {
      return '';
    }
    const variant = this.selectedVariant();
    const amount = variant ? variant.amount : detail.product.amount;
    return this.formatPrice(amount, detail.product.currency || this.currency());
  });

  readonly pdpInStock = computed(() => {
    const variant = this.selectedVariant();
    if (variant) {
      return variant.inStock && variant.stock > 0;
    }
    return this.detail()?.product.inStock ?? false;
  });

  readonly reviewSummary = computed(() => {
    const reviews = this.detail()?.reviews ?? [];
    if (reviews.length === 0) {
      return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
    }
    const distribution = [0, 0, 0, 0, 0];
    let total = 0;
    for (const review of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(review.rating)));
      distribution[star - 1] += 1;
      total += review.rating;
    }
    return {
      average: Math.round((total / reviews.length) * 10) / 10,
      count: reviews.length,
      distribution: distribution.reverse(),
    };
  });

  // ─── Cart (engine) ──────────────────────────────────────────────────────────
  readonly cartItems = this.#store.items;
  readonly cartCount = computed(() =>
    this.#store.items().reduce((sum, item) => sum + item.quantity, 0),
  );
  readonly cartLineCount = this.#store.itemCount;
  readonly hasCart = this.#store.hasItems;
  readonly cartTotalMinor = computed(() => this.#store.pricing().totalAmount);
  readonly cartTotalLabel = computed(() =>
    this.formatMinor(this.cartTotalMinor()),
  );
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    // Recompute on each navigation/data load; the flag is set by the API client.
    void this.searched();
    void this.view();
    void this.detail();
    void this.orders();
    void this.wishlist();
    return this.#api.degraded;
  });

  /** Carrito agrupado por vendedor (marketplace multi-seller). */
  readonly cartGroups = computed<readonly CartSellerGroup[]>(() => {
    const groups = new Map<string, SessionItem[]>();
    for (const item of this.cartItems()) {
      const seller = this.itemString(item.selection, 'seller') || DEFAULT_SELLER_GROUP;
      const bucket = groups.get(seller) ?? [];
      bucket.push(item);
      groups.set(seller, bucket);
    }
    return [...groups.entries()].map(([seller, items]) => ({
      seller,
      items,
      totalMinor: items.reduce((sum, item) => sum + item.amount * item.quantity, 0),
    }));
  });

  // ─── Carrito: SH-12 `syn-cart-shell` (#22) ──────────────────────────────────
  // La vitrina es la pieza; acá sólo se traduce el motor a sus datos. Todos los
  // importes salen YA formateados: la pieza no hace aritmética a propósito, y el
  // total de esta tienda lo decide `reprice()`, no una suma de la plantilla.
  readonly cartLines = computed<readonly CartLine[]>(() =>
    this.cartItems().map((item) => ({
      id: item.id,
      label: this.itemLineLabel(item),
      unit: `${this.itemUnitLabel(item)} c/u`,
      total: this.itemLineTotalLabel(item),
      quantity: item.quantity,
      groupId: this.itemString(item.selection, 'seller') || DEFAULT_SELLER_GROUP,
    })),
  );

  readonly cartGroupHeaders = computed<readonly CartGroup[]>(() =>
    this.cartGroups().map((group) => ({
      id: group.seller,
      label: `Vendido por ${group.seller}`,
      total: this.groupTotalLabel(group),
    })),
  );

  /**
   * El vencimiento más cercano de las líneas apartadas. El más cercano y no el
   * del carrito: el primero que se muera se lleva la compra entera, así que
   * enseñar cualquier otro sería prometer un tiempo que no existe.
   */
  readonly cartHoldExpiresAt = computed<string | null>(() => {
    const vencimientos = this.cartItems()
      .map((item) => item.expiresAt)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .sort();
    return vencimientos[0] ?? null;
  });

  readonly cartPageConfig = computed<CartShellConfig>(() => ({
    heading: 'Tu carrito',
    emptyMessage: 'Tu carrito está vacío.',
    holdLabel: 'Tenemos tus artículos reservados',
    holdExpiredLabel: 'La reserva venció. Vuelve a agregar los artículos para continuar.',
  }));

  readonly cartDrawerConfig = computed<CartShellConfig>(() => ({
    ...this.cartPageConfig(),
    heading: 'Carrito',
    density: 'drawer',
    closeLabel: 'Cerrar carrito',
  }));

  readonly cartPageActions = computed<readonly CartAction[]>(() => [
    { id: 'continue', label: 'Seguir comprando', visibility: 'always' },
    { id: 'checkout', label: 'Continuar compra', kind: 'primary' },
  ]);

  readonly cartDrawerActions = computed<readonly CartAction[]>(() => [
    { id: 'view', label: 'Ver carrito' },
    { id: 'checkout', label: 'Ir a pagar', kind: 'primary' },
  ]);

  onCartAction(id: string): void {
    switch (id) {
      case 'continue':
        this.continueShopping();
        break;
      case 'view':
        this.goToCart();
        break;
      case 'checkout':
        this.goToCheckout();
        break;
      default:
        break;
    }
  }

  onCartQuantity(change: CartQuantityChange): void {
    const item = this.cartItems().find((i) => i.id === change.id);
    if (item) {
      this.setLineQuantity(item, change.quantity);
    }
  }

  /**
   * El apartado venció mientras la persona miraba el carrito. No se vacía solo
   * —borrarle la selección sin avisar es peor que la selección muerta— pero sí
   * se repregunta el precio: es lo que destapa que ya no hay existencias.
   */
  onCartHoldExpired(): void {
    this.reprice();
    this.emitCartUpdate();
  }

  // ─── Checkout (SH-3 inputs) ─────────────────────────────────────────────────
  // Arrancan desde el host: con sesión, el CMS ya dijo quién es en esta misma
  // página. Pedírselo por formulario era pedirle dos veces lo mismo (#17).
  // Siguen siendo editables — quien compra para otra persona cambia el nombre.
  /** Hay sesión en el host. La cuenta lo dice en vez de pedir los datos a ciegas. */
  // ─── Confirmación de compra (SH-11) ─────────────────────────────────────────
  readonly confirmationConfig = computed<ConfirmationShellConfig>(() => ({
    heading: 'Compra confirmada',
    summary: 'Te enviamos el detalle por correo.',
    referenceLabel: 'Número de pedido',
    stepsLabel: 'Qué sigue',
    copyLabel: 'Copiar número',
    copiedLabel: 'Número copiado',
  }));

  readonly confirmationSteps: readonly ConfirmationStep[] = [
    { id: 'pagado', label: 'Pago recibido', done: true },
    { id: 'alistando', label: 'Preparamos tu pedido', detail: 'Te avisamos cuando salga.' },
    { id: 'envio', label: 'Envío', detail: 'Puedes seguirlo desde «Mis compras».' },
  ];

  readonly confirmationActions: readonly ConfirmationAction[] = [
    { id: 'compras', label: 'Ver mis compras', kind: 'primary' },
    { id: 'seguir', label: 'Seguir comprando' },
  ];

  onConfirmationAction(id: string): void {
    if (id === 'compras') {
      this.goToAccount();
      return;
    }
    this.startOver();
  }

  readonly isAuthenticated = this.#identity.isAuthenticated;
  /** Correo del miembro, para que la cuenta muestre con quién está trabajando. */
  readonly memberEmail = this.#identity.email;

  readonly customerName = signal(this.#identity.displayName());
  readonly customerEmail = signal(this.#identity.email());
  readonly customerAddress = signal('');
  readonly customerCity = signal('');
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  readonly customerNameValid = computed(() => this.customerName().trim().length >= 2);
  readonly customerEmailValid = computed(() => /.+@.+\..+/.test(this.customerEmail().trim()));
  readonly shippingValid = computed(
    () =>
      this.customerNameValid() &&
      this.customerEmailValid() &&
      this.customerAddress().trim().length > 3 &&
      this.customerCity().trim().length > 1,
  );

  // ─── El camino de compra (ADR 0140, 004-tienda-compra) ──────────────────────
  /**
   * Por dónde compra, como lo DECLARA el CMS en `purchasePath`: la puerta (`tienda.compra`) o la ruta
   * directa, la de siempre. Sin declaración, la directa.
   */
  readonly caminoDeCompra = computed<CaminoDeCompra>(() => caminoDeLaCompra(this.config()?.purchasePath));

  /**
   * Si ESTA compra va por la puerta: la que ya salió, por el camino por el que salió (su saga sólo existe
   * de ese lado); sin ninguna en curso, la que declara el CMS. Nunca se cae de un camino al otro.
   */
  readonly porLaPuerta = computed(
    () => caminoDeLaCompraEnCurso(this.#store.session(), this.config()?.purchasePath) === 'puerta',
  );

  /** El país al que despacha el sitio (ISO 3166-1 alfa-2): lo declara el CMS, el formulario no lo pregunta. */
  readonly shippingCountry = computed(() => coerceTrimmedStringInput(this.config()?.shippingCountry) ?? '');

  /** La zona del sitio (IANA), en la que «Mis compras» dice sus fechas: la declara el CMS (`zonaHoraria`). */
  readonly zonaHoraria = computed(() => coerceTrimmedStringInput(this.config()?.zonaHoraria) ?? '');

  /** Un 401 de la puerta a mitad de la compra: la sesión terminó y se pide otra vez, en el mismo panel. */
  readonly sesionRequerida = signal(false);

  /** Por la puerta la compra es de miembros: sin sesión se pide ANTES de pagar, no a mitad. */
  readonly pideSesion = computed(() => this.porLaPuerta() && (!this.isAuthenticated() || this.sesionRequerida()));

  /** Lo que dice el panel de sesión, del diccionario (sección `Storefront.Purchase`, ADR 0136). */
  readonly textosDeLaSesion = computed(() => ({
    titulo: t('Storefront.Purchase.SignInTitle', 'Inicia sesión para comprar'),
    texto: this.sesionRequerida()
      ? t('Storefront.Purchase.SessionRequired', 'Tu sesión terminó. Inicia sesión para seguir con tu compra.')
      : t('Storefront.Purchase.SignInText', 'La compra en esta tienda es para miembros. Al volver, tu carrito seguirá aquí.'),
    boton: t('Storefront.Purchase.SignIn', 'Iniciar sesión'),
  }));

  /**
   * Pasos apagables por config: datos → pago → revisar (sin paso de cita). El fallo lo dice el ASISTENTE,
   * una vez (UI#91). Por la ruta directa, con los avisos de un cobro: `pay` abre el cobro y el aviso de
   * después nombra su referencia. Por la puerta, del diccionario: abrir sólo AUTORIZA, así que «ya recibimos
   * tu pago» sería falso, y cada código que la persona puede provocar dice lo suyo (`#mensajeDeFallo`).
   */
  readonly checkoutConfig = computed<CheckoutWizardConfig>(() => ({
    steps: [
      { id: 'datos', label: 'Envío' },
      { id: 'pago', label: 'Pago' },
      { id: 'revisar', label: 'Confirmar' },
    ],
    summaryHeading: 'Tu pedido',
    submitLabel: 'Pagar y confirmar',
    ...(this.porLaPuerta()
      ? {
          payFailedMessage: t('Storefront.Purchase.Failed', 'No pudimos completar tu compra y no se te cobró nada. Intenta de nuevo.'),
          confirmFailedMessage: t(
            'Storefront.Purchase.ConfirmPending',
            'Tu pago quedó autorizado (referencia {referencia}), pero no pudimos terminar la compra. Vuelve a intentarlo: no se te cobrará dos veces.',
          ),
          mensajeDeFallo: this.#mensajeDeFallo,
        }
      : AVISOS_DE_UN_COBRO),
    processingLabel: 'Procesando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
  }));

  /**
   * EL aviso de un fallo de la compra por la puerta, por el `code` que devolvió la estrategia (ADR 0136: la
   * funcionalidad traduce, con claves literales). Tienen texto propio los códigos que la persona puede
   * provocar; los demás caen al de su clase, y los que no tienen (`null`) a los avisos del asistente, que
   * nombran lo que QUEDÓ. «Te devolvimos el cobro» sólo lo dice la estrategia tras CONSULTAR la saga.
   */
  readonly #mensajeDeFallo = (motivo: string, referencia = ''): string | null => {
    switch (motivo) {
      case CODIGO_COMPRA_SIN_RESOLVER:
        void this.cargarComprasSinResolver();
        return t('Storefront.Purchase.PendingFound', 'Tienes una compra sin terminar. Termínala o cancélala antes de empezar otra.');
      case CODIGO_COBRO_DEVUELTO:
        return t('Storefront.Purchase.Refunded', 'No pudimos despachar tu pedido, así que te devolvimos el cobro.');
      case CODIGO_SIN_SABER:
        return t(
          'Storefront.Purchase.Unknown',
          'Todavía no sabemos en qué quedó tu compra (referencia {referencia}). Revisa «Mis compras» en unos minutos antes de volver a comprar.',
          { referencia },
        );
      case 'inventory.insufficient_stock':
      case 'inventory.unit_taken':
        return t('Storefront.Purchase.OutOfStock', 'No quedan unidades suficientes de uno de tus productos. Revisa tu carrito.');
      case 'pricing.price_not_found':
      case 'pricing.price_not_in_effect':
        return t('Storefront.Purchase.NotOnSale', 'Uno de tus productos ya no está a la venta. Revisa tu carrito.');
      case 'pricing.promotion_not_found':
      case 'pricing.promotion_expired':
      case 'pricing.promotion_currency_mismatch':
        // El código venció entre la vista previa y abrir: no se apartó nada, y el cupón se quita.
        this.quitarElCupon();
        return t('Storefront.Purchase.PromoRemoved', 'El código dejó de valer y lo quitamos. Revisa el total antes de pagar.');
      case CODIGO_DEMASIADOS_CODIGOS:
        return t('Storefront.Purchase.PromoTooMany', 'Probaste demasiados códigos que no sirven. Inténtalo más tarde, o compra sin código.');
      case 'payments.payment_declined':
      case 'payments.payment_failed':
        return t('Storefront.Purchase.PaymentDeclined', 'Tu pago fue rechazado y no se te cobró nada. Puedes intentarlo con otro medio de pago.');
      default:
        break;
    }
    switch (claseDelMotivo(motivo)) {
      case 'sesion':
        this.sesionRequerida.set(true);
        return t('Storefront.Purchase.SessionRequired', 'Tu sesión terminó. Inicia sesión para seguir con tu compra.');
      case 'no_disponible':
        return t('Storefront.Purchase.Unavailable', 'La compra en línea no está disponible en este momento.');
      default:
        return null;
    }
  };

  readonly checkoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    datos: this.shippingValid(),
    pago: true,
    // Mientras se valida un código no se paga: abrir leería la sesión SIN el cupón que se acaba de pedir.
    revisar: !this.promoBusy(),
  }));

  readonly checkoutInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    apiBase: this.apiBase(),
    customer: this.checkoutCustomer(),
    provider: this.paymentMethod() === 'pse' ? 'shop-pse' : 'shop-card',
    host: this.#host,
    camino: this.caminoDeCompra(),
    // La dirección de «cerrar» por la puerta, con el país del despliegue; la directa la lleva en `customer`.
    direccion: direccionDeEnvio({
      direccion: this.customerAddress(),
      ciudad: this.customerCity(),
      pais: this.shippingCountry(),
      contacto: this.customerName(),
    }),
  }));

  // ─── Confirmation ───────────────────────────────────────────────────────────
  readonly orderRef = signal('');
  readonly orderNumber = signal('');
  readonly confirmedItems = signal<readonly { title: string; qty: number; reference: string }[]>(
    [],
  );

  // ─── Account (SH-4 inputs) ──────────────────────────────────────────────────
  readonly accountSection = signal<AccountSectionId>('compras');
  readonly orders = signal<readonly ShopOrder[]>([]);
  readonly ordersLoaded = signal(false);
  readonly ordersLoading = signal(false);
  readonly wishlist = signal<readonly WishlistEntry[]>([]);
  readonly wishlistLoaded = signal(false);
  readonly threads = signal<readonly MessageThread[]>([]);
  readonly threadsLoaded = signal(false);
  readonly trackingByRef = signal<Readonly<Record<string, readonly TrackingStage[]>>>({});
  /** Por qué «Mis compras» no tiene lista: sin sesión, o con la lectura caída (004-tienda-compra, etapa 3). */
  readonly estadoDeLasCompras = signal<LecturaDeCompras['estado']>('leidas');
  /** Los pedidos cuyo seguimiento no se pudo leer: dicen «Seguimiento no disponible», no una línea de tiempo inventada. */
  readonly seguimientoCaido = signal<ReadonlySet<string>>(new Set<string>());
  /**
   * Los reclamos por pedido, **leídos del servidor** (#32).
   *
   * Antes sólo lo escribía `startReturn` y nunca se cargaba, así que al recargar
   * la página el reclamo desaparecía, «Iniciar devolución» volvía a aparecer y el
   * comprador abría un SEGUNDO reclamo sobre el mismo pedido. El
   * `GET /order/{ref}/return` existía desde siempre y no lo llamaba nadie.
   */
  readonly returnsByRef = signal<Readonly<Record<string, readonly ReturnCase[]>>>({});
  /** Los pedidos cuyos reclamos SÍ se pudieron leer. Ver `canReturn`. */
  readonly returnsLoaded = signal<ReadonlySet<string>>(new Set<string>());
  readonly returnReasons = RETURN_REASONS;
  readonly returnDraft = signal<ReturnDraft | null>(null);
  readonly returnSending = signal(false);
  readonly returnError = signal('');

  readonly wishedIds = computed(() => new Set(this.wishlist().map((entry) => entry.productId)));
  readonly unreadCount = computed(() => this.threads().filter((thread) => thread.unread).length);

  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mi cuenta',
    navLabel: 'Secciones de la cuenta',
    inboxEmptyMessage: 'Todavía no tienes compras.',
    inboxLoadingMessage: 'Cargando tus compras…',
    detailPlaceholder: 'Selecciona una compra para ver el detalle y su seguimiento.',
    ...this.bandejaSinLista(),
    sections: [
      { id: 'compras', label: 'Mis compras', kind: 'inbox' },
      { id: 'favoritos', label: 'Favoritos', badge: this.wishlist().length || undefined },
      { id: 'mensajes', label: 'Mensajes', badge: this.unreadCount() || undefined },
      { id: 'perfil', label: 'Mis datos' },
    ],
  }));

  /**
   * Lo que dice «Mis compras» cuando no hay lista (004-tienda-compra, etapa 3): sin sesión pide entrar, y con la
   * lectura caída lo dice y ofrece reintentar. Nunca los pedidos de ejemplo.
   */
  private bandejaSinLista(): Partial<AccountShellConfig> {
    switch (this.estadoDeLasCompras()) {
      case 'sin-sesion':
        return {
          inboxEmptyTitle: t('Storefront.Purchase.OrdersSignIn', 'Inicia sesión para ver tus compras'),
          inboxEmptyMessage: '',
          inboxEmptyActionLabel: t('Storefront.Purchase.SignIn', 'Iniciar sesión'),
          inboxEmptyActionHref: this.loginUrl(),
        };
      case 'caida':
        return { errorMessage: t('Storefront.Purchase.OrdersUnavailable', 'No pudimos cargar tus compras.') };
      default:
        return {};
    }
  }

  constructor() {
    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `storefront.${this.instanceId}`,
      flow: STOREFRONT_FLOW,
      ttlMs: SESSION_TTL_MS,
    });
    this.#bus.scope(`storefront-${this.instanceId}`);

    // Register the cart widget so the orchestrator tracks page readiness.
    const cartWidget = this.#orchestrator.register('storefront-cart', { order: 0 });
    this.#orchestrator.setStatus(cartWidget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/p/<id>, #/<scope>/cuenta/...).
    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(cartWidget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });
  }

  /**
   * Abre lo que eligió el editor y carga contra la API del sitio.
   *
   * No va en el constructor: en un custom element los inputs —el `config` del CMS— se aplican
   * DESPUÉS de crear el componente y ANTES del primer ciclo, así que el constructor los ve vacíos
   * (el defecto que el piloto de la ADR 0137 encontró en `eventos`, CMS#194).
   */
  ngOnInit(): void {
    // El enlace del aviso de una compra por la puerta (`?compra={id}`, 004-tienda-compra): se lee UNA vez y
    // sale de la URL, así recargar no vuelve a abrirla.
    this.#compraDelEnlace = compraDelEnlace();
    olvidarLaCompraDelEnlace();
    // Open with an unfiltered listing (feeds home rails + PLP), then honour a deep link.
    void this.runSearch().then(() => {
      this.applyHash();
      if (this.#compraDelEnlace) {
        void this.abrirCompraDelEnlace(this.#compraDelEnlace);
      }
    });
  }

  // ─── La compra por la puerta: el enlace, la pendiente (004-tienda-compra) ────────
  /** La compra que trajo el enlace del aviso, leída una vez en `ngOnInit`. */
  #compraDelEnlace = '';

  /** Lo que se dice de la compra del enlace cuando no se puede mostrar (sin sesión, ajena, en curso). */
  readonly avisoDelEnlace = signal('');

  /** Si el aviso del enlace es por la sesión: entonces lleva el enlace para entrar. */
  readonly enlacePideSesion = signal(false);

  /**
   * Abre la compra del enlace: su orden, como la registra el CMS, en la confirmación. Sin sesión pide entrar
   * «para ver tu compra» (y el login vuelve con el enlace); una ajena o que no existe es «no la encontramos»;
   * una que todavía corre lo dice, sin afirmar nada.
   */
  private async abrirCompraDelEnlace(id: string): Promise<void> {
    if (!this.isAuthenticated()) {
      this.enlacePideSesion.set(true);
      this.avisoDelEnlace.set(t('Storefront.Purchase.LinkSignIn', 'Inicia sesión para ver tu compra.'));
      return;
    }
    const r = await this.#api.compraDeLaPuerta(this.apiBase(), id);
    if (!r.ok) {
      const clase = claseDelMotivo(r.rechazo.code);
      this.enlacePideSesion.set(clase === 'sesion');
      this.avisoDelEnlace.set(
        clase === 'sesion'
          ? t('Storefront.Purchase.LinkSignIn', 'Inicia sesión para ver tu compra.')
          : r.rechazo.code === 'tienda.purchase_not_found'
            ? t('Storefront.Purchase.NotFound', 'No encontramos esta compra en tu cuenta.')
            : r.rechazo.code === 'tienda.compra_en_curso'
              ? t('Storefront.Purchase.InProgress', 'Tu compra todavía se está procesando. Inténtalo de nuevo en unos segundos.')
              : t('Storefront.Purchase.Retry', 'No pudimos completar este paso. Intenta de nuevo.'),
      );
      return;
    }
    const orden = r.valor;
    if (orden.status.toLowerCase() !== 'paid') {
      // Una compra pendiente o deshecha no tiene confirmación que mostrar.
      this.avisoDelEnlace.set(
        orden.status.toLowerCase() === 'pending'
          ? t('Storefront.Purchase.InProgress', 'Tu compra todavía se está procesando. Inténtalo de nuevo en unos segundos.')
          : t('Storefront.Purchase.NotFound', 'No encontramos esta compra en tu cuenta.'),
      );
      return;
    }
    this.orderRef.set(orden.orderRef);
    this.orderNumber.set(orden.orderNumber);
    this.confirmedItems.set(orden.items.map((l) => ({ title: l.title, qty: l.qty, reference: orden.orderNumber })));
    this.navigate('confirmation');
  }

  /**
   * Login del CMS de vuelta a ESTA página. Método y no `computed`: el hash cambia con la navegación. Con la
   * compra del enlace sin mostrar, el login vuelve CON ella: es la que esa persona vino a ver.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return '/account/login';
    }
    const consulta = new URLSearchParams(consultaSinLaCompra());
    if (this.enlacePideSesion() && this.#compraDelEnlace) {
      consulta.set(PARAMETRO_DE_LA_COMPRA, this.#compraDelEnlace);
    }
    const texto = consulta.toString();
    const aqui = `${window.location.pathname}${texto ? `?${texto}` : ''}${window.location.hash}`;
    return `/account/login?returnUrl=${encodeURIComponent(aqui)}`;
  }

  /** La compra por la puerta que esta sesión dejó sin terminar (abierta y sin cerrar), si la hay. */
  readonly compraSinTerminar = computed(() => {
    const sesion = this.#store.session();
    return caminoDeLaPendiente(sesion) === 'puerta' ? compraPendiente(sesion) : null;
  });

  /** Se intentó cambiar el carrito con una compra sin terminar: se pinta el aviso con sus dos salidas. */
  readonly avisoDePendiente = signal(false);

  /** Las compras de la puerta del miembro sin resolver que el servidor conoce y esta sesión no. */
  readonly comprasSinResolver = signal<readonly CompraPendienteDelServidor[]>([]);

  /** Se está resolviendo una pendiente: los botones no se repiten. */
  readonly resolviendo = signal(false);

  /** Lo que dicen el aviso y sus botones, del diccionario (sección `Storefront.Purchase`). */
  readonly textosDeLaPendiente = computed(() => ({
    texto: t('Storefront.Purchase.PendingFound', 'Tienes una compra sin terminar. Termínala o cancélala antes de empezar otra.'),
    terminar: t('Storefront.Purchase.PendingResume', 'Terminar mi compra'),
    cancelar: t('Storefront.Purchase.PendingCancel', 'Cancelar esa compra'),
  }));

  /**
   * El carrito no cambia mientras una compra por la puerta pueda cobrar: lo que se abrió es lo que se
   * cierra, y otra llave sería otra saga que aparta y autoriza al lado. Elegir otra vez la resuelve primero.
   */
  private carritoFijado(): boolean {
    if (this.compraSinTerminar() === null) {
      return false;
    }
    this.avisoDePendiente.set(true);
    return true;
  }

  /** Terminar la compra pendiente: el asistente repite lo que falta con la MISMA llave y la misma compra. */
  terminarPendiente(): void {
    this.avisoDePendiente.set(false);
    this.goToCheckout();
  }

  /**
   * Cancelar la compra pendiente de esta sesión: se deshace en el orquestador —suelta lo apartado, anula el
   * pedido y el cobro autorizado— y el carrito queda libre. Si abrir nunca contestó, se recupera su saga con
   * la MISMA llave antes de cancelarla. Si resulta que sí se completó, se muestra en vez de cancelarla.
   */
  async cancelarPendiente(): Promise<void> {
    const sesion = this.#store.getValidSession();
    if (this.compraSinTerminar() === null || this.resolviendo()) {
      return;
    }
    this.resolviendo.set(true);
    try {
      let id = compraDeLaSesion(sesion);
      const llave = llaveRetenida(sesion);
      if (!id && llave) {
        const recuperada = await abrirCompraDeTienda(
          this.#host,
          cuerpoDeLaCompra(sesion, cuponDeLaSesion(sesion.pricing)?.codigo ?? null),
          llave,
        );
        id = recuperada.ok ? recuperada.valor.id : null;
      }
      if (id && !(await this.cancelarYAsentar(id))) {
        return;
      }
      this.#store.setSession(sinCompraPendiente(this.#store.getValidSession()));
      this.avisoDePendiente.set(false);
      this.#announcer.announce(t('Storefront.Purchase.PendingCancelled', 'Cancelamos la compra que estaba sin terminar. Ya puedes empezar otra.'));
    } finally {
      this.resolviendo.set(false);
    }
  }

  /**
   * Cancela una compra de la puerta y dice si quedó deshecha. Si cancelar no contesta con ella, la
   * CONSULTA: una completa se muestra (no se cancela lo cobrado), una que no se sabe se deja como está.
   */
  private async cancelarYAsentar(id: string): Promise<boolean> {
    const cancelada = await cancelarCompraDeTienda(this.#host, id);
    if (cancelada.ok) {
      return cancelada.valor.estado === 'Compensated' || cancelada.valor.estado === 'Compensating';
    }
    if (claseDelMotivo(cancelada.rechazo.code) === 'sesion') {
      this.sesionRequerida.set(true);
      return false;
    }
    const orden = await this.#api.compraDeLaPuerta(this.apiBase(), id);
    if (orden.ok && orden.valor.status.toLowerCase() === 'paid') {
      this.#store.setStatus('confirmed');
      this.avisoDePendiente.set(false);
      this.orderRef.set(orden.valor.orderRef);
      this.orderNumber.set(orden.valor.orderNumber);
      this.confirmedItems.set(orden.valor.items.map((l) => ({ title: l.title, qty: l.qty, reference: orden.valor.orderNumber })));
      this.navigate('confirmation');
      return false;
    }
    this.#announcer.announce(t('Storefront.Purchase.Retry', 'No pudimos completar este paso. Intenta de nuevo.'), 'assertive');
    return false;
  }

  /** Las compras sin resolver que conoce el servidor (otro dispositivo, datos del sitio borrados), sin la de esta sesión. */
  async cargarComprasSinResolver(): Promise<void> {
    const r = await this.#api.comprasPendientes(this.apiBase());
    const propia = compraDeLaSesion(this.#store.getValidSession())?.split('#')[0] ?? null;
    this.comprasSinResolver.set(r.ok ? r.valor.filter((c) => c.id.split('#')[0] !== propia) : []);
  }

  /** Cancela una compra sin resolver que conoce el servidor, y vuelve a preguntar cuáles quedan. */
  async cancelarCompraSinResolver(id: string): Promise<void> {
    if (this.resolviendo()) {
      return;
    }
    this.resolviendo.set(true);
    try {
      if (await this.cancelarYAsentar(id)) {
        this.#announcer.announce(t('Storefront.Purchase.PendingCancelled', 'Cancelamos la compra que estaba sin terminar. Ya puedes empezar otra.'));
      }
      await this.cargarComprasSinResolver();
    } finally {
      this.resolviendo.set(false);
    }
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Router ──────────────────────────────────────────────────────────────────
  navigate(view: StorefrontView, param = ''): void {
    if (view === 'checkout' && !this.hasCart()) {
      view = 'cart';
    }
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  goHome(): void {
    this.navigate('home');
  }

  goToPlp(): void {
    this.navigate('plp');
  }

  goToCart(): void {
    this.cartOpen.set(false);
    this.navigate('cart');
  }

  goToCheckout(): void {
    if (!this.hasCart()) {
      return;
    }
    this.cartOpen.set(false);
    this.navigate('checkout');
  }

  goToAccount(section: AccountSectionId = 'compras'): void {
    this.navigate('account', section);
  }

  continueShopping(): void {
    this.navigate('plp');
  }

  private applyRoute(view: StorefrontView, param: string): void {
    this.errorMessage.set('');
    switch (view) {
      case 'pdp':
        if (param && param !== this.detail()?.product.id) {
          void this.loadProduct(param);
        }
        this.view.set('pdp');
        return;
      case 'account': {
        const section = (ACCOUNT_SECTIONS as readonly string[]).includes(param)
          ? (param as AccountSectionId)
          : 'compras';
        this.accountSection.set(section);
        this.view.set('account');
        this.loadAccountSection(section);
        return;
      }
      case 'confirmation':
        if (!this.orderNumber()) {
          this.view.set('home');
          return;
        }
        this.view.set('confirmation');
        return;
      default:
        this.view.set(view);
    }
  }

  private routeHash(view: StorefrontView, param: string): string {
    const base = baseDeRuta(this.scope());
    switch (view) {
      case 'home':
        return base;
      case 'pdp':
        return `${base}/p/${encodeURIComponent(param)}`;
      case 'account':
        return `${base}/cuenta${param ? `/${param}` : ''}`;
      case 'cart':
        return `${base}/carrito`;
      case 'confirmation':
        return `${base}/confirmacion`;
      default:
        return `${base}/${view}`;
    }
  }

  private writeHash(view: StorefrontView, param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = this.routeHash(view, param);
    if (!mismaRuta(window.location.hash, hash)) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (mismaRuta(hash, this.#suppressedHash)) {
      this.#suppressedHash = '';
      return;
    }
    const segments = segmentosDeRuta(hash, this.scope());
    if (!segments) {
      return;
    }
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('home', '');
        return;
      case 'plp':
        this.applyRoute('plp', '');
        return;
      case 'p':
        this.applyRoute('pdp', tail);
        return;
      case 'carrito':
        this.applyRoute('cart', '');
        return;
      case 'checkout':
        this.applyRoute(this.hasCart() ? 'checkout' : 'cart', '');
        return;
      case 'confirmacion':
        this.applyRoute('confirmation', '');
        return;
      case 'cuenta':
        this.applyRoute('account', tail);
        return;
      default:
        this.applyRoute('home', '');
    }
  }

  // ─── Home ────────────────────────────────────────────────────────────────────
  submitHomeSearch(): void {
    const term = this.homeTerm().trim();
    this.criteria.set({ ...CLEAN_CRITERIA, term });
    this.navigate('plp');
    void this.runSearch();
  }

  openCategory(category: string): void {
    this.criteria.set({ ...CLEAN_CRITERIA, facets: { category: [category] } });
    this.navigate('plp');
    void this.runSearch();
  }

  // ─── Search / PLP (SH-1 wiring) ──────────────────────────────────────────────
  onCriteriaChange(criteria: DiscoveryCriteria): void {
    this.criteria.set(criteria);
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    const active = this.criteria();
    const sort =
      SORT_OPTIONS.find((option) => option.key === active.sort)?.key ?? 'relevance';
    const criteria: SearchCriteria = {
      q: active.term,
      category: '',
      facets: active.facets,
      sort,
      page: active.page,
    };
    this.loading.set(true);
    this.errorMessage.set('');
    // Dedup concurrent identical searches via the orchestrator.
    const requestId = `search:${JSON.stringify(criteria)}`;
    try {
      const result = await this.#orchestrator.callApi(requestId, () =>
        this.#api.search(this.apiBase(), criteria, this.currency()),
      );
      this.products.set(result.products);
      this.total.set(result.total);
      this.discoveryFacets.set(
        result.facets.map((facet) => ({
          key: facet.key,
          label: facet.label,
          // El kind VIAJA: es lo que hace que `minRating` se pinte como radio (un umbral es
          // un piso, no una suma). Sin él, el shell cae a MultiSelect y vuelve el checkbox.
          kind: facet.kind,
          values: facet.values.map((value) => ({
            value: value.value,
            label: value.label,
            count: value.count,
          })),
        })),
      );
      this.searched.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los productos. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  productPriceLabel(product: ShopProduct): string {
    return this.formatPrice(product.amount, product.currency || this.currency());
  }

  productListPriceLabel(product: ShopProduct): string {
    return product.listAmount
      ? this.formatPrice(product.listAmount, product.currency || this.currency())
      : '';
  }

  /** Iniciales (hasta 2) para el plato-fallback cuando un producto no trae foto.
   *  Reemplaza el emoji genérico por un monograma intencional y theme-aware.
   *
   *  La regla vive en `@synergos/shared`, compartida con `product-card`; aquí solo
   *  se expone al template. La copia local recorría UNIDADES UTF-16: un título que
   *  empezaba por emoji imprimía media pareja subrogada (un rombo) y las comillas
   *  de apertura pasaban como inicial. */
  readonly monogram = monogramOf;

  /** Imágenes que fallaron al cargar (404) → la card cae al monograma en vez de
   *  mostrar un ícono de imagen rota. Robusto ante rutas de media inexistentes. */
  readonly #imgFailed = signal<ReadonlySet<string>>(new Set<string>());
  onImageError(id: string): void {
    this.#imgFailed.update((s) => {
      const n = new Set(s);
      n.add(id);
      return n;
    });
  }
  hasImage(product: { id: string; images?: readonly string[] }): boolean {
    return (product.images?.length ?? 0) > 0 && !this.#imgFailed().has(product.id);
  }

  // ─── PDP (SH-2 wiring) ───────────────────────────────────────────────────────
  openProduct(product: ShopProduct): void {
    this.navigate('pdp', product.id);
  }

  backToResults(): void {
    this.detail.set(null);
    this.navigate('plp');
  }

  selectVariant(variant: ProductVariant): void {
    this.selectedVariantId.set(variant.variantId);
  }

  changeQuantity(delta: number): void {
    this.pdpQuantity.update((qty) => {
      const max = this.selectedVariant()?.stock ?? 99;
      return Math.min(Math.max(1, qty + delta), Math.max(1, max));
    });
  }

  /** Último id de producto solicitado, para reintentar desde el error-state del PDP. */
  #pendingProductId = '';

  /** Reintenta cargar el PDP tras un error (lo invoca el (retry) de syn-error-state). */
  retryProduct(): void {
    if (this.#pendingProductId) {
      void this.loadProduct(this.#pendingProductId);
    }
  }

  private async loadProduct(id: string): Promise<void> {
    this.#pendingProductId = id;
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`product:${id}`, () =>
        this.#api.product(this.apiBase(), id, this.currency()),
      );
      this.detail.set(detail);
      const firstInStock =
        detail.variants.find((variant) => variant.inStock) ?? detail.variants[0] ?? null;
      this.selectedVariantId.set(firstInStock?.variantId ?? '');
      this.pdpQuantity.set(1);
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el producto. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Reseñar (T10 Ola B) ─────────────────────────────────────────────────────
  //
  // El formulario solo existe si el SERVIDOR dice que este visitante puede reseñar
  // (`detail.canReview`: autenticado + orden pagada de este producto). No se deduce aquí:
  // deducirlo sería ofrecer un formulario que rebota con 403.

  readonly reviewSending = signal(false);
  /** Mensaje al comprador tras enviar. Vacío = no se ha enviado nada aún. */
  readonly reviewNotice = signal('');
  readonly reviewFailed = signal(false);

  readonly canReview = computed(() => this.detail()?.canReview === true);
  /** Sin nota y sin texto no hay reseña que enviar. */
  // ─── SH-13 `syn-review-panel` (#28) ─────────────────────────────────────────
  //
  // El formulario a mano se va; la regla de negocio se queda tal cual, que es lo
  // que había que conservar: `canReview` lo decide el SERVIDOR y el 403 NO ofrece
  // volver a entrar (ADR 0112). Lo que gana la Tienda es que **la distribución por
  // fin se pinta**: `reviewSummary()` la calculaba desde siempre y ninguna
  // plantilla la usaba.
  readonly reviewPanel = viewChild(ReviewPanelComponent);

  readonly reviewPanelSummary = computed<ReviewSummary>(() => {
    const resumen = this.reviewSummary();
    // `distribution` viene de 5★ a 1★ (ya invertida); se le pone su estrella.
    const distribution = resumen.distribution.map((count, index) => ({
      stars: 5 - index,
      count,
    }));
    return { average: resumen.average, count: resumen.count, distribution };
  });

  readonly reviewEntries = computed<readonly ReviewEntry[]>(() =>
    (this.detail()?.reviews ?? []).map((review) => ({
      id: review.id,
      author: review.author,
      rating: review.rating,
      title: review.title,
      body: review.body,
      date: review.date,
      // En la Tienda toda reseña publicada pasó el gate de compra: el servidor no
      // acepta otras. El sello dice eso, no lo adivina.
      verified: true,
    })),
  );

  /**
   * Por qué no puede reseñar, cuando no puede.
   *
   * Sin sesión es `unauthenticated` —volver a entrar SÍ lo arregla—; con sesión es
   * `not-consumer`, y ese mensaje no ofrece login porque la sesión no es el
   * problema y sugerirlo manda al comprador a dar vueltas (ADR 0112).
   */
  readonly reviewBlockedReason = computed<ReviewBlockedReason | null>(() => {
    if (this.canReview() || !this.detail()) {
      return null;
    }
    return this.isAuthenticated() ? 'not-consumer' : 'unauthenticated';
  });

  readonly reviewPanelConfig = computed<ReviewPanelConfig>(() => ({
    heading: 'Opiniones',
    countLabel: 'opiniones',
    formTitle: 'Cuenta tu experiencia',
    submitLabel: 'Publicar opinión',
    verifiedLabel: 'Compra verificada',
    blockedNotConsumer:
      'Solo quien compró este producto puede opinar sobre él.',
    emptyMessage: 'Todavía no hay opiniones de este producto.',
  }));


  /** La estrella elegida llega por el CustomEvent `ratingchange` de `synergos-rating-stars`. */



  /**
   * Publica la opinión. El borrador llega de SH-13 (#28); la regla de negocio no
   * cambió ni una línea — sólo el sitio desde donde llega el texto.
   */
  async submitReview(draft: ReviewDraft): Promise<void> {
    const product = this.detail()?.product;
    if (!product || this.reviewSending()) {
      return;
    }

    this.reviewSending.set(true);
    this.reviewNotice.set('');
    this.reviewFailed.set(false);

    const result = await this.#api.submitReview(this.apiBase(), product.id, {
      rating: draft.rating,
      title: draft.title,
      body: draft.body,
    });

    this.reviewSending.set(false);

    if (result.ok) {
      // La pieza NO se limpia sola al enviar, a propósito: sólo acá se sabe que el
      // servidor aceptó. Borrar antes sería el defecto #26 con otro disfraz. Y se
      // limpia en LOS DOS casos: encolada también es aceptada, y dejar el texto
      // puesto invita a mandarlo otra vez.
      this.reviewPanel()?.reset();

      if (result.pending) {
        // **Ni «publicada» ni recarga** (#31). Recargar traería una lista donde la
        // reseña no está, o sea la prueba de que el acuse miente, en la misma
        // pantalla y en el mismo segundo.
        this.reviewNotice.set(
          'Gracias. Tu opinión quedó en revisión y se publicará cuando la aprueben.',
        );
        return;
      }

      this.reviewNotice.set('¡Gracias! Tu opinión ya está publicada.');
      // Se recarga la ficha para que la nota y la lista salgan del SERVIDOR y no de una
      // suposición del cliente: si el envío editó una reseña previa, el conteo NO sube.
      await this.loadProduct(product.id);
      return;
    }

    this.reviewFailed.set(true);
    // Cada motivo dice la verdad. En particular el 403 NO ofrece volver a entrar: la sesión
    // no es el problema, y sugerirlo manda al comprador a dar vueltas (ADR 0112).
    switch (result.reason) {
      case 'unauthenticated':
        this.reviewNotice.set('Inicia sesión para dejar tu opinión.');
        break;
      case 'not-buyer':
        this.reviewNotice.set('Solo quien compró este producto puede opinar sobre él.');
        break;
      case 'invalid':
        this.reviewNotice.set('Revisa la calificación y el texto de tu opinión.');
        break;
      default:
        this.reviewNotice.set('No pudimos publicar tu opinión. Intenta de nuevo.');
    }
  }

  // ═══ Consola del vendedor — SH-5 (#32) ═══════════════════════════════════════
  //
  // Tienda era el único de los tres dominios con cara B que no la tenía, y eso
  // dejó sin sitio a la cola de moderación de #31 y sin consumidor al
  // `POST /return/{rmaId}/advance`, que existía desde siempre.
  readonly role = signal<ShopRole>('buyer');
  readonly sellerView = signal<SellerView>('orders');
  readonly desk = signal<SellerDeskResult | null>(null);
  readonly deskLoaded = signal(false);
  readonly deskBusyId = signal<string | null>(null);
  readonly deskNotice = signal('');
  readonly deskFailed = signal(false);

  setRole(role: ShopRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    if (role === 'seller') {
      this.view.set('seller');
      void this.loadDesk();
      return;
    }
    this.view.set('home');
  }

  onSellerSectionChange(section: string): void {
    if (SELLER_SECTIONS.includes(section as SellerView)) {
      this.sellerView.set(section as SellerView);
    }
  }

  private async loadDesk(): Promise<void> {
    if (this.deskLoaded()) {
      return;
    }
    this.desk.set(await this.#api.sellerDesk(this.apiBase()));
    this.deskLoaded.set(true);
  }

  readonly sellerOrders = computed<readonly SellerOrder[]>(() => this.desk()?.orders ?? []);

  /**
   * La cola de devoluciones, con **las que esperan al vendedor primero**.
   *
   * `abierto` es «nadie la ha mirado» y `en-revision` ya está en marcha; lo
   * resuelto y lo rechazado son historia y van al final. Ordenar por fecha
   * dejaría un reclamo sin abrir debajo de tres ya cerrados.
   */
  readonly sellerReturns = computed<readonly ReturnCase[]>(() =>
    [...(this.desk()?.returns ?? [])].sort(
      (a, b) => RETURN_QUEUE_ORDER[a.status] - RETURN_QUEUE_ORDER[b.status],
    ),
  );

  /** Las reportadas primero, y entre ellas la más reportada. Igual que en #31. */
  readonly sellerModeration = computed<readonly ShopModerationItem[]>(() =>
    [...(this.desk()?.moderation ?? [])].sort((a, b) => {
      if (a.reason !== b.reason) {
        return a.reason === 'reported' ? -1 : 1;
      }
      return b.reportCount - a.reportCount;
    }),
  );

  readonly sellerConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Consola del vendedor',
    navLabel: 'Secciones del vendedor',
    kpisLabel: 'Indicadores de la tienda',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay nada por atender en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      {
        id: 'orders',
        label: 'Pedidos',
        kind: 'table',
        badge: this.desk()?.pendingShipments || undefined,
      },
      {
        id: 'returns',
        label: 'Devoluciones',
        kind: 'table',
        // El badge cuenta lo PENDIENTE, no el total: un número que incluye lo ya
        // resuelto no dice cuánto trabajo queda.
        badge:
          this.sellerReturns().filter((c) => c.status === 'abierto' || c.status === 'en-revision')
            .length || undefined,
      },
      {
        id: 'reviews',
        label: 'Opiniones',
        kind: 'table',
        badge: this.sellerModeration().length || undefined,
      },
      { id: 'messages', label: 'Mensajes', kind: 'custom' },
    ],
  }));

  readonly sellerKpis = computed<readonly ConsoleKpi[]>(() => {
    const desk = this.desk();
    if (!desk) {
      return [];
    }
    return [
      { id: 'sales', label: 'Ventas', value: desk.salesFormatted || '—' },
      { id: 'pending', label: 'Por despachar', value: String(desk.pendingShipments) },
      { id: 'returns', label: 'Devoluciones abiertas', value: String(this.openReturnCount()) },
    ];
  });

  readonly openReturnCount = computed(
    () =>
      this.sellerReturns().filter((c) => c.status === 'abierto' || c.status === 'en-revision')
        .length,
  );

  readonly sellerOrderColumns: readonly ConsoleColumn[] = [
    { key: 'sellerOrder', label: 'Pedido' },
    { key: 'sellerBuyer', label: 'Comprador' },
    { key: 'sellerStatus', label: 'Estado' },
    { key: 'sellerTotal', label: 'Total' },
  ];
  readonly sellerReturnColumns: readonly ConsoleColumn[] = [
    { key: 'returnStatus', label: 'Estado' },
    { key: 'returnProduct', label: 'Producto' },
    { key: 'returnReason', label: 'Motivo' },
    { key: 'returnAmount', label: 'A devolver' },
  ];
  readonly sellerModerationColumns: readonly ConsoleColumn[] = [
    { key: 'modReason', label: 'Motivo' },
    { key: 'modAuthor', label: 'Quién y dónde' },
    { key: 'modBody', label: 'Qué dice' },
  ];

  // `rejected` y `refunded` son `danger`: uno le niega la devolución a alguien y
  // el otro MUEVE PLATA. Un botón neutro invita a pulsarlo sin mirar.
  readonly sellerReturnActions: readonly ConsoleRowAction[] = [
    { id: 'approved', label: 'Aprobar', kind: 'primary' },
    { id: 'received', label: 'Recibido', kind: 'default' },
    { id: 'refunded', label: 'Reembolsar', kind: 'danger' },
    { id: 'rejected', label: 'Rechazar', kind: 'danger' },
  ];
  readonly sellerModerationActions: readonly ConsoleRowAction[] = [
    { id: 'approve', label: 'Aprobar', kind: 'primary' },
    { id: 'reject', label: 'Rechazar', kind: 'danger' },
  ];
  readonly sellerNoActions: readonly ConsoleRowAction[] = [];

  readonly sellerRows = computed<
    readonly (SellerOrder | ReturnCase | ShopModerationItem)[]
  >(() => {
    switch (this.sellerView()) {
      case 'returns':
        return this.sellerReturns();
      case 'reviews':
        return this.sellerModeration();
      case 'messages':
        return [];
      default:
        return this.sellerOrders();
    }
  });

  readonly sellerColumns = computed<readonly ConsoleColumn[]>(() => {
    switch (this.sellerView()) {
      case 'returns':
        return this.sellerReturnColumns;
      case 'reviews':
        return this.sellerModerationColumns;
      default:
        return this.sellerOrderColumns;
    }
  });

  readonly sellerActions = computed<readonly ConsoleRowAction[]>(() => {
    switch (this.sellerView()) {
      case 'returns':
        return this.sellerReturnActions;
      case 'reviews':
        return this.sellerModerationActions;
      default:
        return this.sellerNoActions;
    }
  });

  onSellerAction(
    event: ConsoleRowActionEvent<SellerOrder | ReturnCase | ShopModerationItem>,
  ): void {
    if (event.sectionId === 'returns') {
      void this.advanceReturn(
        (event.row as ReturnCase).claimId,
        event.actionId as ReturnAdvance,
      );
      return;
    }
    if (event.sectionId === 'reviews') {
      void this.decideSellerReview(
        (event.row as ShopModerationItem).id,
        event.actionId === 'reject' ? 'reject' : 'approve',
      );
    }
  }

  /**
   * El vendedor mueve un reclamo.
   *
   * **El estado se actualiza sólo con lo que devuelve el servidor**, nunca con lo
   * que se pulsó: `refunded` dispara un reembolso de verdad, así que pintar
   * «Resuelto» sobre un POST que falló diría que se devolvió una plata que sigue
   * donde estaba. Y el borde explica la transición ilegal en `{ error }` —«no se
   * puede pasar de rechazado a recibido»—, así que esa frase se enseña tal cual.
   */
  async advanceReturn(claimId: string, status: ReturnAdvance): Promise<void> {
    if (this.deskBusyId() !== null) {
      return;
    }
    this.deskBusyId.set(claimId);
    this.deskFailed.set(false);
    this.deskNotice.set('');

    const result = await this.#api.advanceReturn(this.apiBase(), claimId, status);
    this.deskBusyId.set(null);

    if (result.ok) {
      this.desk.update((desk) =>
        desk
          ? {
              ...desk,
              returns: desk.returns.map((c) => (c.claimId === claimId ? result.claim : c)),
            }
          : desk,
      );
      this.deskNotice.set(`Reclamo ${result.claim.claimId}: ${this.returnStatusLabel(result.claim)}.`);
      return;
    }

    this.deskFailed.set(true);
    this.deskNotice.set(result.detail || ADVANCE_ERRORS[result.reason]);
  }

  /** La cola de opiniones, con el mismo criterio que Educación (#31). */
  async decideSellerReview(reviewId: string, decision: 'approve' | 'reject'): Promise<void> {
    if (this.deskBusyId() !== null) {
      return;
    }
    this.deskBusyId.set(reviewId);
    this.deskFailed.set(false);
    this.deskNotice.set('');

    const result = await this.#api.decideShopModeration(this.apiBase(), reviewId, decision);
    this.deskBusyId.set(null);

    // `already-decided` sale de la cola igual: otra persona la atendió.
    if (result.ok || result.reason === 'already-decided') {
      this.desk.update((desk) =>
        desk
          ? { ...desk, moderation: desk.moderation.filter((item) => item.id !== reviewId) }
          : desk,
      );
      this.deskNotice.set(
        result.ok
          ? decision === 'approve'
            ? 'Opinión aprobada. Ya se ve en el producto.'
            : 'Opinión rechazada. No se publicará.'
          : 'Otra persona ya la había atendido.',
      );
      return;
    }

    this.deskFailed.set(true);
    this.deskNotice.set(
      result.reason === 'forbidden'
        ? 'No puedes moderar las opiniones de este producto.'
        : 'No pudimos guardar la decisión. La opinión sigue como estaba.',
    );
  }

  sellerModerationReasonLabel(item: ShopModerationItem): string {
    return item.reason === 'reported'
      ? `Reportada ${item.reportCount === 1 ? '1 vez' : `${item.reportCount} veces`}`
      : 'Sin publicar';
  }

  // ─── Reportar una reseña (#31) ───────────────────────────────────────────────
  //
  // `Api.Moderation` lleva meses construida con un campo `Reporter` y CERO
  // consumidores. Esto es el primero por el lado de quien lee.
  readonly reportedReviewIds = signal<readonly string[]>([]);
  readonly reportingReviewId = signal<string | null>(null);

  /**
   * **Quien no tiene sesión no reporta.** Un reporte anónimo no se puede atender
   * —no hay a quién volver— ni deduplicar, así que ofrecer el botón sería ofrecer
   * uno que va a rebotar con 401: el mismo criterio de `canReview` (ADR 0112).
   */
  readonly canReportReview = computed(() => this.isAuthenticated());

  async reportReview(reviewId: string): Promise<void> {
    if (this.reportingReviewId() !== null || this.reportedReviewIds().includes(reviewId)) {
      return;
    }
    this.reportingReviewId.set(reviewId);
    this.reviewFailed.set(false);

    const result = await this.#api.reportReview(this.apiBase(), reviewId);
    this.reportingReviewId.set(null);

    // `already-reported` se trata como éxito a propósito: el servidor deduplica, así
    // que «ya lo habíamos recibido» es exactamente lo que la persona necesita saber
    // y decirle «falló» la haría reintentar algo que ya está hecho.
    if (result.ok || result.reason === 'already-reported') {
      this.reportedReviewIds.update((ids) => [...ids, reviewId]);
      this.reviewNotice.set('Gracias por avisar. Vamos a revisarla.');
      return;
    }

    this.reviewFailed.set(true);
    this.reviewNotice.set(
      result.reason === 'unauthenticated'
        ? 'Inicia sesión para reportar una opinión.'
        : 'No pudimos registrar el reporte. Intenta de nuevo.',
    );
  }

  // ─── SH-14 Comparar (#30) ────────────────────────────────────────────────────
  //
  // En una tienda el eje es la FICHA TÉCNICA, no el precio: quien compara dos
  // televisores ya sabe lo que cuestan. Marca, condición y vendedor importan
  // tanto como el precio, y «envío gratis» decide más de lo que parece.
  readonly compare = new CompareSelection<CompareCandidate>(4);
  readonly compareRejection = signal<CompareRejection | null>(null);

  readonly compareAttributes: readonly CompareAttribute[] = [
    { id: 'price', label: 'Precio', group: 'Lo que cuesta' },
    { id: 'listPrice', label: 'Antes', group: 'Lo que cuesta' },
    { id: 'shipping', label: 'Envío', group: 'Lo que cuesta' },
    { id: 'brand', label: 'Marca', group: 'Lo que es' },
    { id: 'category', label: 'Categoría', group: 'Lo que es' },
    { id: 'condition', label: 'Condición', group: 'Lo que es' },
    { id: 'seller', label: 'Vendedor', group: 'Quién lo vende' },
    { id: 'rating', label: 'Calificación', group: 'Qué dicen' },
    { id: 'stock', label: 'Disponibilidad', group: 'Quién lo vende' },
  ];

  readonly compareConfig: CompareTableConfig = {
    heading: 'Comparar productos',
    nounPlural: 'productos',
    needMoreMessage: 'Marca al menos dos productos para ver sus fichas lado a lado.',
  };

  readonly compareMessage = computed(() => {
    switch (this.compareRejection()) {
      case 'limit-reached':
        return `Puedes comparar hasta ${this.compare.limit} productos. Quita uno para añadir otro.`;
      case 'already-added':
        return 'Ese producto ya está en la comparación.';
      default:
        return '';
    }
  });

  inCompare(id: string): boolean {
    return this.compare.has(id);
  }

  toggleCompare(product: ShopProduct): void {
    this.compareRejection.set(this.compare.toggle(this.toCandidate(product)));
  }

  removeFromCompare(id: string): void {
    this.compare.remove(id);
    this.compareRejection.set(null);
  }

  clearCompare(): void {
    this.compare.clear();
    this.compareRejection.set(null);
  }

  openCompared(candidate: CompareCandidate): void {
    const product = this.products().find((item) => item.id === candidate.id);
    if (product) {
      this.openProduct(product);
    }
  }

  /**
   * **«Sin stock» SÍ se escribe, y «sin reseñas» NO.** Un producto agotado es un
   * dato que decide —es la fila que hace descartar una columna— mientras que un
   * `rating` de 0 sin reseñas no es «malo»: es que nadie opinó, y escribir «0,0»
   * ahí es afirmar algo que nadie dijo. Es el mismo criterio del `reviewCount` de
   * SH-13 (#28).
   */
  private toCandidate(product: ShopProduct): CompareCandidate {
    const values: Record<string, string> = {
      price: this.productPriceLabel(product),
      listPrice: this.productListPriceLabel(product),
      shipping: product.freeShipping ? 'Gratis' : 'Con costo',
      brand: product.brand,
      category: product.category,
      condition: CONDITION_LABELS[product.condition],
      seller: product.seller ?? '',
      rating:
        product.reviewCount > 0
          ? `${product.rating.toFixed(1)} (${product.reviewCount})`
          : '',
      stock: product.inStock ? 'Disponible' : 'Sin stock',
    };
    return {
      id: product.id,
      title: product.title,
      subtitle: product.subtitle,
      headline: this.productPriceLabel(product),
      imageUrl: product.images[0] || undefined,
      values,
    };
  }

  // ─── Wishlist (favoritos) ────────────────────────────────────────────────────
  isWished(productId: string): boolean {
    return this.wishedIds().has(productId);
  }

  toggleWishlist(product: ShopProduct): void {
    const entry: WishlistEntry = {
      productId: product.id,
      title: product.title,
      amount: product.amount,
      currency: product.currency || this.currency(),
      image: product.images[0],
    };
    const action = this.isWished(product.id) ? 'remove' : 'add';
    const before = this.wishlist().find((line) => line.productId === product.id) ?? null;
    // Optimistic update; the server's list reconciles after — or the failure reverts it.
    this.wishlist.update((list) => {
      const without = list.filter((line) => line.productId !== product.id);
      return action === 'add' ? [...without, entry] : without;
    });
    this.wishlistLoaded.set(true);
    this.errorMessage.set('');
    void this.#api
      .wishlistMutate(this.apiBase(), entry, action)
      .then((list) => this.wishlist.set(list))
      .catch(() => this.revertWish(product.id, before));
  }

  removeWishlistEntry(entry: WishlistEntry): void {
    const before = this.wishlist().find((line) => line.productId === entry.productId) ?? null;
    this.wishlist.update((list) => list.filter((line) => line.productId !== entry.productId));
    this.errorMessage.set('');
    void this.#api
      .wishlistMutate(this.apiBase(), entry, 'remove')
      .then((list) => this.wishlist.set(list))
      .catch(() => this.revertWish(entry.productId, before));
  }

  /**
   * El servidor no guardó el cambio (UI#92): ESE producto vuelve a como estaba —sin tocar
   * los demás, que pudieron cambiar entretanto— y se dice. Antes el cliente devolvía su
   * «lista local» como si fuera la guardada, y el favorito desaparecía al volver otro día.
   */
  private revertWish(productId: string, before: WishlistEntry | null): void {
    this.wishlist.update((list) => {
      const without = list.filter((line) => line.productId !== productId);
      return before ? [...without, before] : without;
    });
    this.errorMessage.set('No pudimos guardar el cambio en tus favoritos. Intenta de nuevo.');
  }

  openWishlistEntry(entry: WishlistEntry): void {
    this.navigate('pdp', entry.productId);
  }

  wishlistPriceLabel(entry: WishlistEntry): string {
    return this.formatPrice(entry.amount, entry.currency || this.currency());
  }

  private loadWishlist(): void {
    if (this.wishlistLoaded()) {
      return;
    }
    void this.#api.wishlist(this.apiBase(), this.currency()).then((list) => {
      this.wishlist.set(list);
      this.wishlistLoaded.set(true);
    });
  }

  // ─── Cart (engine wiring) ────────────────────────────────────────────────────
  /**
   * Agrega lo que muestra la ficha. **Un producto sin variantes se agrega como tal** (004-tienda-compra, etapa 3): los
   * del CMS llegan con `variants: []`, `selectedVariant` quedaba en `null` y el botón volvía en silencio. Lo único que
   * frena aquí es no tener existencias, y entonces el botón está deshabilitado y la ficha dice «Sin stock».
   */
  addCurrentToCart(): void {
    const detail = this.detail();
    if (!detail || !this.pdpInStock()) {
      return;
    }
    this.addToCart(detail.product, this.selectedVariant() ?? varianteEstandar(detail.product), this.pdpQuantity());
  }

  quickAdd(product: ShopProduct): void {
    if (!product.inStock) {
      return;
    }
    // El agregado rápido del catálogo no elige variante: la del producto mismo.
    this.addToCart(product, varianteEstandar(product), 1);
  }

  /**
   * El producto cuyo último «agregar» FALLÓ, para que se VEA junto al botón que se pulsó
   * (#87). Desde el #82 el fallo se oía —el anunciador, asertivo— y no se veía nada: quien
   * mira la pantalla pulsaba, el cajón no se abría y no había ningún porqué. No es una
   * región viva: el anuncio ya lo hace el anunciador, y una segunda región lo diría dos veces.
   */
  readonly addFailedId = signal<string | null>(null);

  private addToCart(product: ShopProduct, variant: ProductVariant, quantity: number): void {
    this.addFailedId.set(null);
    if (this.carritoFijado()) {
      return;
    }
    const session = this.#store.getValidSession();
    const payload: ShopSelectionPayload = {
      productId: product.id,
      variantId: variant.variantId,
      variantLabel: variant.label,
      title: product.title,
      unitAmount: variant.amount,
      currency: product.currency || this.currency(),
      quantity,
      image: product.images[0] ?? '',
      seller: product.seller,
      // La base viaja en la línea para que `confirm` no tenga que adivinarla (#116).
      apiBase: this.apiBase(),
    };
    void this.#fulfillment
      .select(
        {
          productRef: product.id,
          kind: 'product',
          label: product.title,
          amount: variant.amount,
          selection: payload as unknown as Readonly<Record<string, unknown>>,
        },
        session,
      )
      .then((selection) => {
        // Merge the delta qty against the live store line at apply time so
        // concurrent quick-adds accumulate (the engine's addItem is replace-by-id).
        const existing = this.#store.items().find((item) => item.id === selection.item.id);
        const merged = existing
          ? { ...selection.item, quantity: existing.quantity + selection.item.quantity }
          : selection.item;
        this.#store.addItem(merged);
        this.reprice();
        this.cartOpen.set(true);
        this.emitCartUpdate();
        // Abrir el cajón se VE; sin esto, agregar al carrito no se oía (#82).
        this.#announcer.announce(`${product.title} agregado al carrito.`);
      })
      .catch(() => {
        // Antes el `.then` no tenía `catch`: el fallo era un rechazo sin manejar, mudo para
        // todos. Desde el #82 se oye, y desde el #87 también se VE, junto al botón.
        this.#announcer.announce(`No se pudo agregar ${product.title} al carrito.`, 'assertive');
        this.addFailedId.set(product.id);
      });
  }

  private setLineQuantity(item: SessionItem, quantity: number): void {
    if (this.carritoFijado()) {
      return;
    }
    if (quantity < 1) {
      this.removeFromCart(item.id);
      return;
    }
    this.#store.addItem({ ...item, quantity });
    this.reprice();
    this.emitCartUpdate();
  }

  removeFromCart(itemId: string): void {
    if (this.carritoFijado()) {
      return;
    }
    this.#store.removeItem(itemId);
    this.reprice();
    this.emitCartUpdate();
  }

  toggleCart(): void {
    this.cartOpen.update((open) => !open);
  }

  itemLineLabel(item: SessionItem): string {
    const variant = this.itemString(item.selection, 'variantLabel');
    return variant ? `${item.label} · ${variant}` : item.label;
  }

  itemUnitLabel(item: SessionItem): string {
    return this.formatMinor(item.amount);
  }

  itemLineTotalLabel(item: SessionItem): string {
    return this.formatMinor(item.amount * item.quantity);
  }

  groupTotalLabel(group: CartSellerGroup): string {
    return this.formatMinor(group.totalMinor);
  }

  // ─── Checkout (SH-3 wiring) ──────────────────────────────────────────────────
  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }

  private checkoutCustomer(): ShopCustomer {
    return {
      name: this.customerName().trim(),
      email: this.customerEmail().trim(),
      address: this.customerAddress().trim(),
      city: this.customerCity().trim(),
    };
  }

  onCheckoutCompleted(result: CheckoutWizardResult): void {
    this.orderRef.set(result.reference);
    const orderNumber =
      this.voucherOrderNumber(result.vouchers) || result.reference;
    this.orderNumber.set(orderNumber);
    this.confirmedItems.set(
      result.vouchers.map((voucher) => ({
        title: this.voucherTitle(voucher.detail),
        qty: this.voucherQty(voucher.detail),
        reference: voucher.reference,
      })),
    );
    // Lo comprado ya no está por comprar: el carrito queda vacío al confirmar, en los dos caminos (etapa 3). El
    // asistente sólo completa con la compra cerrada (por la puerta, `cerrar` contestó), así que no queda nada abierto.
    this.#store.reset();
    this.ordersLoaded.set(false);
    this.navigate('confirmation');
    const payload = { orderRef: result.reference, orderNumber };
    this.orderconfirmed.emit(payload);
    this.#bus.publish('orderconfirmed', payload);
    this.emitCartUpdate();
  }

  // ─── Account (SH-4 wiring) ───────────────────────────────────────────────────
  onAccountSectionChange(sectionId: string): void {
    const section = (ACCOUNT_SECTIONS as readonly string[]).includes(sectionId)
      ? (sectionId as AccountSectionId)
      : 'compras';
    this.accountSection.set(section);
    this.writeHash('account', section);
    this.loadAccountSection(section);
  }

  private loadAccountSection(section: AccountSectionId): void {
    if (section === 'compras' && !this.ordersLoaded()) {
      void this.loadOrders();
    } else if (section === 'favoritos') {
      this.loadWishlist();
    } else if (section === 'mensajes') {
      this.loadThreads();
    }
  }

  onOrderSelect(order: ShopOrder): void {
    if (this.trackingByRef()[order.orderNumber]) {
      return;
    }
    void this.#api
      .tracking(this.apiBase(), order.orderRef, order.status)
      .then((tracking) => {
        if (tracking === null) {
          this.seguimientoCaido.update((caidos) => new Set(caidos).add(order.orderNumber));
          return;
        }
        this.seguimientoCaido.update((caidos) => {
          const resto = new Set(caidos);
          resto.delete(order.orderNumber);
          return resto;
        });
        this.trackingByRef.update((map) => ({
          ...map,
          [order.orderNumber]: tracking.stages.map((stage) => ({
            ...stage,
            date: stage.date ? momentoDeLaTienda(stage.date, this.zonaHoraria()) : stage.date,
          })),
        }));
      });
  }

  /**
   * Lo que dice el seguimiento cuando no tiene etapas que pintar (004-tienda-compra, etapa 3): «Consultando…» mientras
   * se lee, y «Seguimiento no disponible» si la lectura cayó o el pedido todavía no tiene ninguna. Antes una caída
   * pintaba una línea de tiempo de ejemplo con fechas que nadie registró.
   */
  mensajeDelSeguimiento(order: ShopOrder): string {
    return this.seguimientoCaido().has(order.orderNumber) || this.trackingByRef()[order.orderNumber]
      ? t('Storefront.Purchase.TrackingUnavailable', 'Seguimiento no disponible')
      : 'Consultando el seguimiento…';
  }

  /** El día del pedido, en es-CO y en la hora del sitio: nunca el ISO crudo (etapa 3). */
  orderDateLabel(order: ShopOrder): string {
    return order.date ? diaDeLaTienda(order.date, this.zonaHoraria()) : '';
  }

  trackingStages(orderRef: string): readonly TrackingStage[] {
    return this.trackingByRef()[orderRef] ?? [];
  }

  /**
   * Si se puede pedir la devolución de esta línea.
   *
   * **La autorización la da el SERVIDOR** (`line.canReturn`, #34), con el mismo
   * gate que aplica el POST — el principio de `canReview` (ADR 0112). Esto lo
   * deducía de `order.status` pidiendo `delivered || shipped`, estados que el
   * dominio **no emite** —el enum tiene `Pending`, `Paid`, `Cancelled`—, así que
   * el botón era inalcanzable contra un servidor real (#33). La copia no se
   * desvió por descuido: se desvió porque era una copia.
   *
   * Lo único que queda de este lado es lo que el servidor no sabe de esta pantalla: **si ya se leyeron los
   * reclamos** —con la lectura caída, un mapa vacío se leería como «no hay ninguno» y ofrecería abrir un segundo
   * sobre la misma línea (#32)—.
   *
   * **El seguimiento ya no decide** (004-tienda-compra, etapa 3). Refinaba con «todavía no llegó», pero nadie avanza
   * el envío (el efecto «seguimiento del envío» está diferido, es del vendedor) y el seguimiento no pasa de «pagado»:
   * «Pedir devolución» no se ofrecía nunca, en ninguno de los dos caminos, aunque el servidor dijera `canReturn`.
   */
  canReturnLine(order: ShopOrder, line: OrderLine): boolean {
    return (
      line.canReturn &&
      this.returnsLoaded().has(order.orderNumber) &&
      this.claimForLine(order.orderNumber, line) === null
    );
  }

  /**
   * El pedido llegó: la etapa `delivered` del pipeline está alcanzada. Ya no decide la devolución (ver
   * `canReturnLine`): se conserva para quien lea la entrega.
   */
  isDelivered(order: ShopOrder): boolean {
    return this.trackingStages(order.orderNumber).some(
      (stage) => stage.id === DELIVERED_STAGE && stage.state === 'done',
    );
  }

  /**
   * Por qué no se ofrece devolver esta línea, cuando la razón le sirve a quien
   * compró. Devuelve cadena vacía cuando no hay nada que explicar —un pedido
   * cancelado no necesita que le cuenten que no se devuelve—.
   */
  returnBlockedReason(order: ShopOrder, line: OrderLine): string {
    if (this.claimForLine(order.orderNumber, line) !== null) {
      return '';
    }
    if (this.returnsUnknown(order)) {
      return 'Consultando devoluciones…';
    }
    if (!line.canReturn) {
      // El motivo lo NOMBRA el servidor (#34). Los que no le sirven a quien
      // compró no se pintan: a quien canceló no hay que contarle que no puede
      // devolver lo que nunca recibió.
      return RETURN_BLOCK_LABELS[line.returnBlock ?? ''] ?? '';
    }
    return '';
  }

  /** Si todavía no se sabe si este pedido tiene reclamos. */
  returnsUnknown(order: ShopOrder): boolean {
    return !this.returnsLoaded().has(order.orderNumber);
  }

  /** Los reclamos de un pedido, tal como los devolvió el servidor. */
  returnsFor(orderRef: string): readonly ReturnCase[] {
    return this.returnsByRef()[orderRef] ?? [];
  }

  /** Si esta línea ya tiene un reclamo vivo. Un rechazo NO cuenta: se puede reabrir. */
  claimForLine(orderRef: string, line: OrderLine): ReturnCase | null {
    const lineRef = lineRefOf(line);
    return (
      this.returnsFor(orderRef).find(
        (claim) => claim.lineRef === lineRef && claim.status !== 'rechazado',
      ) ?? null
    );
  }

  /**
   * Abre el formulario de devolución de UNA línea.
   *
   * Es por línea y no por pedido porque **el reclamo es por línea**: el borde
   * guarda `LineRef`, `ProductName`, `Quantity` y `RefundAmount`, y devolver «el
   * pedido» de tres artículos cuando llegó uno roto no es lo que nadie quiere.
   */
  openReturn(orderRef: string, line: OrderLine): void {
    const apiRef = this.orders().find((order) => order.orderNumber === orderRef)?.orderRef ?? orderRef;
    this.returnDraft.set({ orderRef, apiRef, line, reason: 'damaged' });
    this.returnError.set('');
  }

  closeReturn(): void {
    this.returnDraft.set(null);
    this.returnError.set('');
  }

  setReturnReason(reason: ReturnReason): void {
    this.returnDraft.update((draft) => (draft ? { ...draft, reason } : draft));
  }

  /**
   * Pide la devolución.
   *
   * **No se da por abierta si el servidor no lo confirmó** — el cliente inventaba
   * un `claimId` y la pantalla decía «Reclamo abierto», así que el comprador se
   * iba con un número que no existe en ninguna parte (#32). Y como el borde
   * explica el rechazo en `{ error }` («solo se puede devolver sobre una orden
   * pagada»), esa frase se enseña tal cual: la escribió quien sabe por qué.
   */
  async submitReturn(): Promise<void> {
    const draft = this.returnDraft();
    if (!draft || this.returnSending()) {
      return;
    }
    this.returnSending.set(true);
    this.returnError.set('');

    const result = await this.#api.requestReturn(
      this.apiBase(),
      draft.apiRef,
      lineRefOf(draft.line),
      draft.reason,
    );
    this.returnSending.set(false);

    if (result.ok) {
      this.returnsByRef.update((map) => ({
        ...map,
        [draft.orderRef]: [
          ...(map[draft.orderRef] ?? []).filter((c) => c.claimId !== result.claim.claimId),
          result.claim,
        ],
      }));
      this.returnDraft.set(null);
      return;
    }

    this.returnError.set(result.detail || RETURN_ERRORS[result.reason]);
  }

  returnStatusLabel(claim: ReturnCase): string {
    switch (claim.status) {
      case 'abierto':
        return 'Reclamo abierto';
      case 'en-revision':
        return 'En revisión';
      case 'resuelto':
        return 'Resuelto';
      case 'rechazado':
        return 'Rechazado';
    }
  }

  returnReasonLabel(reason: string): string {
    return RETURN_REASON_LABELS[reason as ReturnReason] ?? reason;
  }

  private async loadOrders(): Promise<void> {
    this.ordersLoading.set(true);
    try {
      const customer = this.customerEmail().trim();
      const lectura = await this.#api.orders(this.apiBase(), customer, this.currency());
      this.estadoDeLasCompras.set(lectura.estado);
      if (lectura.estado !== 'leidas') {
        // Sin lista no hay pedidos que pintar: ni los de ejemplo ni los de una lectura anterior (etapa 3).
        this.orders.set([]);
        return;
      }
      this.orders.set(lectura.pedidos);
      this.ordersLoaded.set(true);
      // Y los reclamos, que es lo que faltaba: sin esto el mapa arrancaba vacío
      // en cada carga y el comprador podía abrir un segundo reclamo (#32).
      await this.loadReturns(lectura.pedidos);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus compras.');
      void error;
    } finally {
      this.ordersLoading.set(false);
    }
  }

  /**
   * Carga los reclamos de cada pedido.
   *
   * Va pedido a pedido porque el borde lo expone así (`GET /order/{ref}/return`).
   * **El pedido cuya lectura falla NO se marca como cargado**, así que su botón
   * no se ofrece en vez de ofrecerse sobre un estado que no se conoce.
   */
  private async loadReturns(orders: readonly ShopOrder[]): Promise<void> {
    const resultados = await Promise.all(
      orders.map(async (order) => ({
        ref: order.orderNumber,
        claims: await this.#api.orderReturns(this.apiBase(), order.orderRef),
      })),
    );
    const mapa: Record<string, readonly ReturnCase[]> = { ...this.returnsByRef() };
    const cargados = new Set(this.returnsLoaded());
    for (const { ref, claims } of resultados) {
      if (claims === null) {
        continue;
      }
      mapa[ref] = claims;
      cargados.add(ref);
    }
    this.returnsByRef.set(mapa);
    this.returnsLoaded.set(cargados);
  }

  /** El reintento de «Mis compras» con la lectura caída (el botón del estado de error). */
  reintentarCompras(): void {
    void this.loadOrders();
  }

  private loadThreads(): void {
    if (this.threadsLoaded()) {
      return;
    }
    void this.#api.messages(this.apiBase()).then((threads) => {
      this.threads.set(threads);
      this.threadsLoaded.set(true);
    });
  }

  orderTotalLabel(order: ShopOrder): string {
    return this.formatPrice(order.total, order.currency || this.currency());
  }

  orderStatusLabel(status: ShopOrder['status']): string {
    switch (status) {
      case 'pending':
        return 'Pendiente de pago';
      case 'paid':
        return 'Pagado';
      case 'preparing':
        return 'Preparando';
      case 'shipped':
        return 'Enviado';
      case 'delivered':
        return 'Entregado';
      case 'cancelled':
        return 'Cancelado';
    }
  }

  // ─── Start a fresh transaction after confirmation ────────────────────────────
  startOver(): void {
    if (this.carritoFijado()) {
      return;
    }
    this.#store.reset();
    this.orderRef.set('');
    this.orderNumber.set('');
    this.confirmedItems.set([]);
    this.errorMessage.set('');
    this.navigate('plp');
    this.emitCartUpdate();
  }

  // ─── Cupones: `syn-promo-code` (#29) ────────────────────────────────────────
  //
  // No había forma de dar un descuento. El motor lo soportaba desde el primer día
  // —`PriceLine.amount` dice «can be negative for discounts»— y ningún dominio
  // emitía una línea negativa; lo único que existía era `listPrice`, un precio
  // tachado que nadie podía obtener.
  readonly promoControl = viewChild(PromoCodeComponent);
  readonly promo = signal<ShopPromo | null>(null);
  readonly promoBusy = signal(false);
  readonly promoRejection = signal<PromoRejection | null>(null);
  readonly promoDetail = signal('');

  readonly appliedPromo = computed<AppliedPromo | null>(() => {
    const promo = this.promo();
    if (!promo) {
      return null;
    }
    return {
      code: promo.code,
      // El importe llega negativo; se muestra con su signo, ya formateado.
      discountLabel: `−${this.formatMinor(Math.abs(promo.amountMinor))}`,
      ...(promo.detail ? { detail: promo.detail } : {}),
    };
  });

  /**
   * El resumen del carrito: líneas del `breakdown` + total.
   *
   * Se pasa a SH-12 como `summary` y no como `total` a secas porque **es la única
   * forma de que el descuento se VEA**. Un total más bajo sin la línea que lo
   * explica se lee como un error de precio.
   */
  readonly cartSummaryRows = computed<readonly CartSummaryRow[]>(() => {
    const promo = this.promo();
    if (!promo) {
      return [];
    }
    const subtotal = this.#store
      .items()
      .reduce((sum, item) => sum + item.amount * item.quantity, 0);
    return [
      {
        id: 'subtotal',
        label: 'Subtotal',
        value: this.formatMinor(subtotal),
      },
      {
        id: 'promo',
        label: promo.label,
        value: `−${this.formatMinor(Math.abs(promo.amountMinor))}`,
      },
      { id: 'total', label: 'Total', value: this.cartTotalLabel(), emphasis: true },
    ];
  });

  /**
   * Valida el cupón contra el servidor. **No lo da por aplicado sin confirmación**:
   * un descuento fingido acá es una promesa de plata que el checkout rompe.
   */
  async applyPromo(code: string): Promise<void> {
    if (this.promoBusy() || this.cuponFijado()) {
      return;
    }
    this.promoBusy.set(true);
    this.promoRejection.set(null);
    this.promoDetail.set('');

    if (this.porLaPuerta()) {
      await this.cotizarConCupon(code);
      this.promoBusy.set(false);
      return;
    }

    const subtotal = this.#store
      .items()
      .reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const result = await this.#api.applyPromo(this.apiBase(), code, subtotal);

    this.promoBusy.set(false);

    if (result.ok) {
      this.promo.set(result.promo);
      this.promoControl()?.clear();
      this.reprice();
      this.emitCartUpdate();
      return;
    }

    this.promoRejection.set(result.reason);
    if (result.reason === 'minimum-not-met' && result.shortfallMinor) {
      // CUÁNTO falta es lo único accionable de este rechazo.
      this.promoDetail.set(
        `Te faltan ${this.formatMinor(result.shortfallMinor)}.`,
      );
    }
  }

  /**
   * Por la puerta, el cupón lo calcula el SERVIDOR (US 8): `cotizar` corre la fase que abre hasta antes de
   * apartar, con el código, y del navegador sólo viaja el código. Lo que se muestra es lo que abrir
   * autorizaría; un código que no existe, vencido, o con demasiados intentos se dice por su motivo.
   */
  private async cotizarConCupon(code: string): Promise<void> {
    const codigo = code.trim().toUpperCase();
    const r = await cotizarCompraDeTienda(this.#host, cuerpoDeLaCompra(this.#store.getValidSession(), codigo));
    if (!r.ok) {
      this.promoRejection.set(motivoDelCupon(r.rechazo.code));
      return;
    }
    const descuento = r.valor.descuento;
    if (!descuento || descuento.amount <= 0) {
      this.promoRejection.set('not-applicable');
      return;
    }
    this.promo.set({ code: codigo, amountMinor: -aMenores(descuento.amount, descuento.currency), label: codigo });
    this.promoControl()?.clear();
    this.reprice();
    this.emitCartUpdate();
  }

  /**
   * El cupón queda FIJO mientras una compra suya pueda cobrar: abrir con otro código sería otra intención,
   * otra saga que aparta y autoriza al lado de la primera.
   */
  readonly cuponFijado = computed(() => compraPendiente(this.#store.session()) !== null);

  /** Los motivos del cupón, del diccionario: el control no sabe del negocio. */
  readonly promoConfig = computed<PromoCodeConfig>(() => ({
    messages: {
      unknown: t('Storefront.Purchase.PromoUnknown', 'No encontramos ese código. Revisa que esté bien escrito.'),
      expired: t('Storefront.Purchase.PromoExpired', 'Ese código ya venció.'),
      'too-many-attempts': t(
        'Storefront.Purchase.PromoTooMany',
        'Probaste demasiados códigos que no sirven. Inténtalo más tarde, o compra sin código.',
      ),
    },
    lockedMessage: t('Storefront.Purchase.PromoFixed', 'El cupón queda fijo mientras tu compra está en curso.'),
  }));

  /** Quita el cupón que dejó de valer al abrir: la compra no se apartó, y el carrito vuelve a su total. */
  private quitarElCupon(): void {
    this.promo.set(null);
    this.reprice();
    this.emitCartUpdate();
  }

  /** Quita el cupón y devuelve el total anterior. */
  removePromo(): void {
    if (this.cuponFijado()) {
      return;
    }
    this.promo.set(null);
    this.promoRejection.set(null);
    this.promoDetail.set('');
    this.reprice();
    this.emitCartUpdate();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  /** Recompute aggregate pricing from the cart lines (single source of truth). */
  private reprice(): void {
    const items = this.#store.items();
    const subtotal = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const promo = this.promo();
    const lineas = items.map((item) => ({
      code: `line:${item.id}`,
      label: item.label,
      amount: item.amount * item.quantity,
    }));
    if (promo) {
      // La línea NEGATIVA que el motor esperaba desde el primer día.
      lineas.push({ code: `${PREFIJO_DEL_CUPON}${promo.code}`, label: promo.label, amount: promo.amountMinor });
    }
    // El descuento nunca deja el total bajo cero: un carrito que se debe a sí
    // mismo no es un carrito, y el checkout lo cobraría como un importe negativo.
    const total = Math.max(0, subtotal + (promo?.amountMinor ?? 0));
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: lineas,
    });
  }

  private emitCartUpdate(): void {
    const count = this.cartCount();
    this.cartchange.emit(count);
    this.#bus.publish('cartUpdated', { count, total: this.cartTotalMinor() });
  }

  private itemString(
    selection: Readonly<Record<string, unknown>> | undefined,
    key: string,
  ): string {
    const value = selection?.[key];
    return typeof value === 'string' ? value : '';
  }

  private voucherTitle(detail: Readonly<Record<string, unknown>> | undefined): string {
    const value = detail?.['title'];
    return typeof value === 'string' ? value : 'Producto';
  }

  private voucherQty(detail: Readonly<Record<string, unknown>> | undefined): number {
    const value = detail?.['qty'];
    return typeof value === 'number' && Number.isFinite(value) ? value : 1;
  }

  private voucherOrderNumber(
    vouchers: readonly { detail?: Readonly<Record<string, unknown>> }[],
  ): string {
    const value = vouchers[0]?.detail?.['orderNumber'];
    return typeof value === 'string' ? value : '';
  }

  /** Un importe con su moneda; sin moneda (todavía no llegó ningún precio) se pinta el número solo. */
  private formatPrice(amount: number, currency: string): string {
    return formatearImporte(amount, currency);
  }

  /** Un importe del carrito, en unidades menores de su moneda (la de la sesión o la del catálogo). */
  private formatMinor(minor: number): string {
    const moneda = this.#store.pricing().currency || this.currency();
    return this.formatPrice(desdeMenores(minor, moneda), moneda);
  }
}
