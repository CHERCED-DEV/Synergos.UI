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
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
  type SessionItem,
} from '@synergos/transaction-engine';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { ShopApiClient } from './shop-api.client';
import type { ShopSelectionPayload } from './shop-fulfillment.strategy';
import {
  STOREFRONT_FLOW,
  type CheckoutStep,
  type Facet,
  type ProductDetail,
  type ProductVariant,
  type SearchCriteria,
  type ShopCustomer,
  type ShopOrder,
  type ShopProduct,
  type SortKey,
  type StorefrontView,
} from './shop.model';

/**
 * Runtime config for the CMS element <c>elementSynStorefront</c>.
 *
 * The Tienda vertical as a real marketplace app (search · PLP · PDP · cart ·
 * checkout · órdenes), reusing the shared <c>@synergos/transaction-engine</c> for
 * the unified cart, single checkout and cross-island coordination.
 */
export interface StorefrontRuntimeConfig {
  /** Base URL of the shop API. Default `/api/shop`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `storefront`. */
  readonly scope?: string;
}

/** Typed event map for the transaction bus (storefront ↔ cart ↔ checkout ↔ IA). */
interface StorefrontBus extends Record<string, unknown> {
  readonly cartUpdated: { readonly count: number; readonly total: number };
  readonly orderconfirmed: { readonly orderRef: string; readonly orderNumber: string };
}

const DEFAULT_API_BASE = '/api/shop';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'storefront';
const SESSION_TTL_MS = 30 * 60 * 1000;
const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
];

function sanitizeConfig(value: Partial<StorefrontRuntimeConfig>): StorefrontRuntimeConfig {
  return omitUndefinedProperties<StorefrontRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
  });
}

let storefrontInstanceId = 0;

@Component({
  selector: 'sg-storefront',
  standalone: true,
  imports: [],
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

  readonly instanceId = (storefrontInstanceId += 1);
  readonly fieldId = `syn-storefront-${this.instanceId}`;
  readonly sortOptions = SORT_OPTIONS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly cartchange = output<number>();
  readonly orderconfirmed = output<{ orderRef: string; orderNumber: string }>();

  // ─── UI state ───────────────────────────────────────────────────────────────
  readonly view = signal<StorefrontView>('plp');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly cartOpen = signal(false);

  // Search / PLP
  readonly searchTerm = signal('');
  readonly activeCategory = signal('');
  readonly selectedFacets = signal<Readonly<Record<string, readonly string[]>>>({});
  readonly sort = signal<SortKey>('relevance');
  readonly products = signal<readonly ShopProduct[]>([]);
  readonly facets = signal<readonly Facet[]>([]);
  readonly searched = signal(false);

  // PDP
  readonly detail = signal<ProductDetail | null>(null);
  readonly selectedVariantId = signal('');
  readonly pdpQuantity = signal(1);
  readonly pdpTab = signal<'reviews' | 'questions'>('reviews');

  // Checkout wizard
  readonly checkoutStep = signal<CheckoutStep>('shipping');
  readonly customerName = signal('');
  readonly customerEmail = signal('');
  readonly customerAddress = signal('');
  readonly customerCity = signal('');
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  // Confirmation
  readonly orderRef = signal('');
  readonly orderNumber = signal('');
  readonly confirmedItems = signal<readonly { title: string; qty: number; reference: string }[]>(
    [],
  );

  // Orders
  readonly orders = signal<readonly ShopOrder[]>([]);
  readonly ordersLoaded = signal(false);

  // ─── Derived cart state (from the engine store) ─────────────────────────────
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
    // Recompute on each search/pdp/checkout; the flag is set by the API client.
    void this.searched();
    void this.view();
    void this.detail();
    return this.#api.degraded;
  });

  // ─── PDP derived ─────────────────────────────────────────────────────────────
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

  // ─── Search validity ─────────────────────────────────────────────────────────
  readonly customerNameValid = computed(() => this.customerName().trim().length >= 2);
  readonly customerEmailValid = computed(() => /.+@.+\..+/.test(this.customerEmail().trim()));
  readonly shippingValid = computed(
    () =>
      this.customerNameValid() &&
      this.customerEmailValid() &&
      this.customerAddress().trim().length > 3 &&
      this.customerCity().trim().length > 1,
  );

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

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(cartWidget);
      this.#bus.destroy();
    });

    // Open the storefront with an initial unfiltered listing.
    void this.runSearch();
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Search / PLP ──────────────────────────────────────────────────────────
  submitSearch(): void {
    void this.runSearch();
  }

  setSort(value: string): void {
    const next = SORT_OPTIONS.find((option) => option.key === value)?.key ?? 'relevance';
    this.sort.set(next);
    void this.runSearch();
  }

  selectCategory(category: string): void {
    this.activeCategory.set(this.activeCategory() === category ? '' : category);
    void this.runSearch();
  }

  isFacetSelected(facetKey: string, value: string): boolean {
    return (this.selectedFacets()[facetKey] ?? []).includes(value);
  }

  toggleFacet(facetKey: string, value: string): void {
    const current = this.selectedFacets();
    const selected = current[facetKey] ?? [];
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];
    this.selectedFacets.set({ ...current, [facetKey]: next });
    void this.runSearch();
  }

  clearFacets(): void {
    this.selectedFacets.set({});
    this.activeCategory.set('');
    void this.runSearch();
  }

  readonly hasActiveFacets = computed(() => {
    if (this.activeCategory()) {
      return true;
    }
    return Object.values(this.selectedFacets()).some((values) => values.length > 0);
  });

  private async runSearch(): Promise<void> {
    if (this.loading()) {
      return;
    }
    const criteria: SearchCriteria = {
      q: this.searchTerm().trim(),
      category: this.activeCategory(),
      facets: this.selectedFacets(),
      sort: this.sort(),
      page: 1,
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.view.set('plp');
    // Dedup concurrent identical searches via the orchestrator.
    const requestId = `search:${JSON.stringify(criteria)}`;
    try {
      const result = await this.#orchestrator.callApi(requestId, () =>
        this.#api.search(this.apiBase(), criteria, this.currency()),
      );
      this.products.set(result.products);
      this.facets.set(result.facets);
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

  // ─── PDP ─────────────────────────────────────────────────────────────────────
  openProduct(product: ShopProduct): void {
    void this.loadProduct(product.id);
  }

  backToResults(): void {
    this.view.set('plp');
    this.detail.set(null);
    this.errorMessage.set('');
  }

  selectVariant(variant: ProductVariant): void {
    this.selectedVariantId.set(variant.variantId);
  }

  setPdpTab(tab: 'reviews' | 'questions'): void {
    this.pdpTab.set(tab);
  }

  changeQuantity(delta: number): void {
    this.pdpQuantity.update((qty) => {
      const max = this.selectedVariant()?.stock ?? 99;
      return Math.min(Math.max(1, qty + delta), Math.max(1, max));
    });
  }

  private async loadProduct(id: string): Promise<void> {
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
      this.pdpTab.set('reviews');
      this.view.set('pdp');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el producto. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Cart ─────────────────────────────────────────────────────────────────────
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

  // ─── Cart → checkout ─────────────────────────────────────────────────────────
  goToCart(): void {
    this.cartOpen.set(false);
    this.view.set('cart');
    this.errorMessage.set('');
  }

  goToCheckout(): void {
    if (!this.hasCart()) {
      return;
    }
    this.errorMessage.set('');
    this.checkoutStep.set('shipping');
    this.view.set('checkout');
    this.cartOpen.set(false);
  }

  continueShopping(): void {
    this.view.set('plp');
    this.errorMessage.set('');
  }

  // ─── Checkout wizard ─────────────────────────────────────────────────────────
  nextCheckoutStep(): void {
    const step = this.checkoutStep();
    if (step === 'shipping') {
      if (!this.shippingValid()) {
        return;
      }
      this.checkoutStep.set('payment');
    } else if (step === 'payment') {
      this.checkoutStep.set('review');
    }
  }

  previousCheckoutStep(): void {
    const step = this.checkoutStep();
    if (step === 'review') {
      this.checkoutStep.set('payment');
    } else if (step === 'payment') {
      this.checkoutStep.set('shipping');
    } else {
      this.view.set('cart');
    }
  }

  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }

  // ─── Single payment + confirmation for the whole cart ────────────────────────
  placeOrder(): void {
    if (!this.shippingValid() || !this.hasCart() || this.loading()) {
      return;
    }
    const customer: ShopCustomer = {
      name: this.customerName().trim(),
      email: this.customerEmail().trim(),
      address: this.customerAddress().trim(),
      city: this.customerCity().trim(),
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.#store.setStatus('paying');

    const session = this.#store.getValidSession();
    // FulfillmentContext routes pay → confirm to the storefront strategy.
    this.#fulfillment
      .pay({ session, instrument: { apiBase: this.apiBase(), customer } })
      .then((result) => {
        if (!result.accepted || !result.reference) {
          throw new Error('payment-rejected');
        }
        this.orderRef.set(result.reference);
        const paid = {
          ...this.#store.getValidSession(),
          payments: [
            {
              id: `pay-${Date.now().toString(36)}`,
              amount: this.cartTotalMinor(),
              provider: this.paymentMethod() === 'pse' ? 'shop-pse' : 'shop-card',
              status: 'captured' as const,
              reference: result.reference,
            },
          ],
          status: 'paying' as const,
        };
        this.#store.setSession(paid);
        return this.#fulfillment.confirm(this.#store.getValidSession());
      })
      .then((confirmation) => {
        if (!confirmation.confirmed) {
          throw new Error('not-confirmed');
        }
        const orderNumber =
          this.confirmationOrderNumber(confirmation.vouchers) || this.orderRef();
        this.orderNumber.set(orderNumber);
        this.confirmedItems.set(
          confirmation.vouchers.map((voucher) => ({
            title: this.voucherTitle(voucher.detail),
            qty: this.voucherQty(voucher.detail),
            reference: voucher.reference,
          })),
        );
        this.#store.setStatus('confirmed');
        this.loading.set(false);
        this.view.set('confirmation');
        this.ordersLoaded.set(false);
        const payload = { orderRef: this.orderRef(), orderNumber };
        this.orderconfirmed.emit(payload);
        this.#bus.publish('orderconfirmed', payload);
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set('No pudimos completar el pago. Intenta de nuevo.');
        this.#store.setStatus('building');
        void error;
      });
  }

  // ─── Orders (history) ────────────────────────────────────────────────────────
  goToOrders(): void {
    this.view.set('orders');
    this.errorMessage.set('');
    if (!this.ordersLoaded()) {
      void this.loadOrders();
    }
  }

  private async loadOrders(): Promise<void> {
    this.loading.set(true);
    try {
      const customer = this.customerEmail().trim();
      const orders = await this.#api.orders(this.apiBase(), customer, this.currency());
      this.orders.set(orders);
      this.ordersLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus compras.');
      void error;
    } finally {
      this.loading.set(false);
    }
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
    this.checkoutStep.set('shipping');
    this.view.set('plp');
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

  private confirmationOrderNumber(
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
