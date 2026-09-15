import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
  type CheckoutWizardResult,
  type DetailMedia,
  type DetailSpec,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type TrackingStage,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  monogram as monogramOf,
  omitUndefinedProperties,
  resolveConfigValue,
  PromoCodeComponent,
  type AppliedPromo,
  type PromoRejection,
  SynSkeletonComponent,
  SynErrorStateComponent,
  SynStatusBannerComponent,
} from '@synergos/shared';
import { ShopApiClient } from './shop-api.client';
import type { ShopSelectionPayload } from './shop-fulfillment.strategy';
import {
  STOREFRONT_FLOW,
  type AccountSectionId,
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
export interface StorefrontRuntimeConfig {
  /** Base URL of the shop API. Default `/api/shop`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `storefront`. */
  readonly scope?: string;
  /** Home hero heading. Default `Todo lo que buscas, en un solo lugar`. */
  readonly heading?: string;
  /** Home hero subheading. Default `Envíos a todo el país · hasta 36 cuotas · compra protegida`. */
  readonly subheading?: string;
}

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

const DEFAULT_API_BASE = '/api/shop';
const DEFAULT_CURRENCY = 'COP';
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

/** Lo que el comprador está a punto de mandar. */
interface ReturnDraft {
  readonly orderRef: string;
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

function sanitizeConfig(value: Partial<StorefrontRuntimeConfig>): StorefrontRuntimeConfig {
  return omitUndefinedProperties<StorefrontRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
  });
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
export class StorefrontElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<StorefrontBus>>(TransactionEventBusService);
  readonly #api = inject(ShopApiClient);
  readonly #identity = inject(HostIdentityService);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<StorefrontRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<StorefrontRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.currencyInput()),
      this.config()?.currency,
      DEFAULT_CURRENCY,
    ),
  );
  readonly scope = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.scopeInput()),
      this.config()?.scope,
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
    this.formatPrice(this.cartTotalMinor() / 100, this.#store.pricing().currency || this.currency()),
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

  /** Pasos apagables por config: datos → pago → revisar (sin paso de cita). */
  readonly checkoutConfig: CheckoutWizardConfig = {
    steps: [
      { id: 'datos', label: 'Envío' },
      { id: 'pago', label: 'Pago' },
      { id: 'revisar', label: 'Confirmar' },
    ],
    summaryHeading: 'Tu pedido',
    submitLabel: 'Pagar y confirmar',
    processingLabel: 'Procesando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
  };

  readonly checkoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    datos: this.shippingValid(),
    pago: true,
    revisar: true,
  }));

  readonly checkoutInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    apiBase: this.apiBase(),
    customer: this.checkoutCustomer(),
    provider: this.paymentMethod() === 'pse' ? 'shop-pse' : 'shop-card',
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
    sections: [
      { id: 'compras', label: 'Mis compras', kind: 'inbox' },
      { id: 'favoritos', label: 'Favoritos', badge: this.wishlist().length || undefined },
      { id: 'mensajes', label: 'Mensajes', badge: this.unreadCount() || undefined },
      { id: 'perfil', label: 'Mis datos' },
    ],
  }));

  constructor() {
    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `storefront.${this.instanceId}`,
      flow: STOREFRONT_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
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

    // Open with an unfiltered listing (feeds home rails + PLP), then honour a deep link.
    void this.runSearch().then(() => this.applyHash());
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
    const base = `#/${this.scope()}`;
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
    if (window.location.hash !== hash) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (hash === this.#suppressedHash) {
      this.#suppressedHash = '';
      return;
    }
    const base = `#/${this.scope()}`;
    if (hash !== base && !hash.startsWith(`${base}/`)) {
      return;
    }
    const segments = hash
      .slice(base.length)
      .split('/')
      .filter((segment) => segment !== '');
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('home', '');
        return;
      case 'plp':
        this.applyRoute('plp', '');
        return;
      case 'p':
        this.applyRoute('pdp', decodeURIComponent(tail));
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
    // Optimistic update; the API (or its local fallback) reconciles after.
    this.wishlist.update((list) => {
      const without = list.filter((line) => line.productId !== product.id);
      return action === 'add' ? [...without, entry] : without;
    });
    this.wishlistLoaded.set(true);
    void this.#api
      .wishlistMutate(this.apiBase(), entry, action)
      .then((list) => this.wishlist.set(list));
  }

  removeWishlistEntry(entry: WishlistEntry): void {
    this.wishlist.update((list) => list.filter((line) => line.productId !== entry.productId));
    void this.#api
      .wishlistMutate(this.apiBase(), entry, 'remove')
      .then((list) => this.wishlist.set(list));
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
  addCurrentToCart(): void {
    const detail = this.detail();
    const variant = this.selectedVariant();
    if (!detail || !variant || !this.pdpInStock()) {
      return;
    }
    this.addToCart(detail.product, variant, this.pdpQuantity());
  }

  quickAdd(product: ShopProduct): void {
    if (!product.inStock) {
      return;
    }
    // Quick-add from the PLP uses a synthetic default variant.
    const variant: ProductVariant = {
      variantId: `${product.id}-default`,
      label: 'Estándar',
      attributes: {},
      amount: product.amount,
      inStock: true,
      stock: 99,
    };
    this.addToCart(product, variant, 1);
  }

  private addToCart(product: ShopProduct, variant: ProductVariant, quantity: number): void {
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
      });
  }

  private setLineQuantity(item: SessionItem, quantity: number): void {
    if (quantity < 1) {
      this.removeFromCart(item.id);
      return;
    }
    this.#store.addItem({ ...item, quantity });
    this.reprice();
    this.emitCartUpdate();
  }

  removeFromCart(itemId: string): void {
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
    return this.formatPrice(item.amount / 100, this.#store.pricing().currency || this.currency());
  }

  itemLineTotalLabel(item: SessionItem): string {
    return this.formatPrice(
      (item.amount * item.quantity) / 100,
      this.#store.pricing().currency || this.currency(),
    );
  }

  groupTotalLabel(group: CartSellerGroup): string {
    return this.formatPrice(
      group.totalMinor / 100,
      this.#store.pricing().currency || this.currency(),
    );
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
    this.ordersLoaded.set(false);
    this.navigate('confirmation');
    const payload = { orderRef: result.reference, orderNumber };
    this.orderconfirmed.emit(payload);
    this.#bus.publish('orderconfirmed', payload);
    this.emitCartUpdate();
  }

  onCheckoutFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos completar el pago. Intenta de nuevo.');
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
      .tracking(this.apiBase(), order.orderNumber, order.status)
      .then((tracking) => {
        this.trackingByRef.update((map) => ({
          ...map,
          [order.orderNumber]: tracking.stages.map((stage) => ({ ...stage })),
        }));
      });
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
   * Lo que queda de este lado son dos cosas que el servidor no sabe:
   *
   * - **si el pedido LLEGÓ** —vive en el seguimiento, y refina sin habilitar—, y
   * - **si ya se leyeron los reclamos**: con la lectura caída, un mapa vacío se
   *   leería como «no hay ninguno» y ofrecería abrir un segundo sobre la misma
   *   línea (#32).
   */
  canReturnLine(order: ShopOrder, line: OrderLine): boolean {
    return (
      line.canReturn &&
      this.deliveredKnownOrUnknown(order) &&
      this.returnsLoaded().has(order.orderNumber) &&
      this.claimForLine(order.orderNumber, line) === null
    );
  }

  /**
   * La entrega **REFINA, no habilita**.
   *
   * Si el timeline está cargado y dice que todavía no llegó, no se ofrece — y la
   * línea lo explica en vez de callarse. Si NO se pudo leer, se ofrece igual: la
   * condición del servidor se cumple, así que no es un botón que vaya a rebotar,
   * y bloquear la devolución porque se cayó el seguimiento sería cambiar un
   * problema de información por uno de negocio.
   */
  private deliveredKnownOrUnknown(order: ShopOrder): boolean {
    const stages = this.trackingStages(order.orderNumber);
    return stages.length === 0 || this.isDelivered(order);
  }

  /** El pedido llegó: la etapa `delivered` del pipeline está alcanzada. */
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
    return this.isDelivered(order) ? '' : 'Podrás devolverlo cuando llegue.';
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
    this.returnDraft.set({ orderRef, line, reason: 'damaged' });
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
      draft.orderRef,
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
      const orders = await this.#api.orders(this.apiBase(), customer, this.currency());
      this.orders.set(orders);
      this.ordersLoaded.set(true);
      // Y los reclamos, que es lo que faltaba: sin esto el mapa arrancaba vacío
      // en cada carga y el comprador podía abrir un segundo reclamo (#32).
      await this.loadReturns(orders);
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
        claims: await this.#api.orderReturns(this.apiBase(), order.orderNumber),
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
      discountLabel: `−${this.formatPrice(Math.abs(promo.amountMinor) / 100, this.currency())}`,
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
        value: this.formatPrice(subtotal / 100, this.currency()),
      },
      {
        id: 'promo',
        label: promo.label,
        value: `−${this.formatPrice(Math.abs(promo.amountMinor) / 100, this.currency())}`,
      },
      { id: 'total', label: 'Total', value: this.cartTotalLabel(), emphasis: true },
    ];
  });

  /**
   * Valida el cupón contra el servidor. **No lo da por aplicado sin confirmación**:
   * un descuento fingido acá es una promesa de plata que el checkout rompe.
   */
  async applyPromo(code: string): Promise<void> {
    if (this.promoBusy()) {
      return;
    }
    this.promoBusy.set(true);
    this.promoRejection.set(null);
    this.promoDetail.set('');

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
        `Te faltan ${this.formatPrice(result.shortfallMinor / 100, this.currency())}.`,
      );
    }
  }

  /** Quita el cupón y devuelve el total anterior. */
  removePromo(): void {
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
      lineas.push({ code: `promo:${promo.code}`, label: promo.label, amount: promo.amountMinor });
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

  private formatPrice(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
    }
  }
}
