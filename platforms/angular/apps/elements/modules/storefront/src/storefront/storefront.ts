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
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
  type SessionItem,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  CheckoutWizardComponent,
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
  SynSkeletonComponent,
  SynErrorStateComponent,
} from '@synergos/shared';
import { ShopApiClient } from './shop-api.client';
import type { ShopSelectionPayload } from './shop-fulfillment.strategy';
import {
  STOREFRONT_FLOW,
  type AccountSectionId,
  type MessageThread,
  type ProductDetail,
  type ProductVariant,
  type ReturnReceipt,
  type SearchCriteria,
  type ShopCustomer,
  type ShopOrder,
  type ShopProduct,
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
    const condition =
      product.condition === 'used'
        ? 'Usado'
        : product.condition === 'refurbished'
          ? 'Reacondicionado'
          : 'Nuevo';
    return `${condition} · ${product.brand}`;
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
      {
        label: 'Condición',
        value:
          product.condition === 'used'
            ? 'Usado'
            : product.condition === 'refurbished'
              ? 'Reacondicionado'
              : 'Nuevo',
      },
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

  // ─── Checkout (SH-3 inputs) ─────────────────────────────────────────────────
  readonly customerName = signal('');
  readonly customerEmail = signal('');
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
  readonly returnsByRef = signal<Readonly<Record<string, ReturnReceipt>>>({});

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

  readonly reviewRating = signal(0);
  readonly reviewTitle = signal('');
  readonly reviewBody = signal('');
  readonly reviewSending = signal(false);
  /** Mensaje al comprador tras enviar. Vacío = no se ha enviado nada aún. */
  readonly reviewNotice = signal('');
  readonly reviewFailed = signal(false);

  readonly canReview = computed(() => this.detail()?.canReview === true);
  /** Sin nota y sin texto no hay reseña que enviar. */
  readonly reviewReady = computed(
    () => this.reviewRating() >= 1 && this.reviewBody().trim().length > 0,
  );

  /** La estrella elegida llega por el CustomEvent `ratingchange` de `synergos-rating-stars`. */
  onReviewRatingChange(event: Event): void {
    const value = Number((event as CustomEvent<number>).detail);
    this.reviewRating.set(Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 0);
  }

  onReviewTitleInput(event: Event): void {
    this.reviewTitle.set((event.target as HTMLInputElement).value);
  }

  onReviewBodyInput(event: Event): void {
    this.reviewBody.set((event.target as HTMLTextAreaElement).value);
  }

  async submitReview(): Promise<void> {
    const product = this.detail()?.product;
    if (!product || !this.reviewReady() || this.reviewSending()) {
      return;
    }

    this.reviewSending.set(true);
    this.reviewNotice.set('');
    this.reviewFailed.set(false);

    const result = await this.#api.submitReview(this.apiBase(), product.id, {
      rating: this.reviewRating(),
      title: this.reviewTitle().trim(),
      body: this.reviewBody().trim(),
    });

    this.reviewSending.set(false);

    if (result.ok) {
      this.reviewNotice.set('¡Gracias! Tu opinión ya está publicada.');
      this.reviewTitle.set('');
      this.reviewBody.set('');
      this.reviewRating.set(0);
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

  incrementLine(item: SessionItem): void {
    this.setLineQuantity(item, item.quantity + 1);
  }

  decrementLine(item: SessionItem): void {
    this.setLineQuantity(item, item.quantity - 1);
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

  canReturn(order: ShopOrder): boolean {
    return (
      (order.status === 'delivered' || order.status === 'shipped') &&
      !this.returnsByRef()[order.orderNumber]
    );
  }

  returnReceipt(orderRef: string): ReturnReceipt | null {
    return this.returnsByRef()[orderRef] ?? null;
  }

  startReturn(order: ShopOrder): void {
    if (!this.canReturn(order)) {
      return;
    }
    void this.#api
      .requestReturn(this.apiBase(), order.orderNumber, 'solicitud-comprador')
      .then((receipt) => {
        this.returnsByRef.update((map) => ({ ...map, [order.orderNumber]: receipt }));
      });
  }

  returnStatusLabel(receipt: ReturnReceipt): string {
    switch (receipt.status) {
      case 'abierto':
        return 'Reclamo abierto';
      case 'en-revision':
        return 'En revisión';
      case 'resuelto':
        return 'Resuelto';
    }
  }

  private async loadOrders(): Promise<void> {
    this.ordersLoading.set(true);
    try {
      const customer = this.customerEmail().trim();
      const orders = await this.#api.orders(this.apiBase(), customer, this.currency());
      this.orders.set(orders);
      this.ordersLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus compras.');
      void error;
    } finally {
      this.ordersLoading.set(false);
    }
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

  // ─── Helpers ───────────────────────────────────────────────────────────────
  /** Recompute aggregate pricing from the cart lines (single source of truth). */
  private reprice(): void {
    const items = this.#store.items();
    const total = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: items.map((item) => ({
        code: `line:${item.id}`,
        label: item.label,
        amount: item.amount * item.quantity,
      })),
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
