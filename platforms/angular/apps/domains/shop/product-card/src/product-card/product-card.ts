import type { ProductCardElementConfig, Product } from '@synergos/contracts';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  BadgeComponent,
  ButtonComponent,
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeProductCardConfig(
  value: Partial<ProductCardElementConfig>,
): Partial<ProductCardElementConfig> {
  return omitUndefinedProperties<ProductCardElementConfig>({
    productSku: coerceTrimmedStringInput(value.productSku),
    productUrlTemplate: coerceTrimmedStringInput(value.productUrlTemplate),
    name: coerceTrimmedStringInput(value.name),
    imageSrc: coerceTrimmedStringInput(value.imageSrc),
    imageAlt: coerceTrimmedStringInput(value.imageAlt),
    showPrice: coerceOptionalBooleanInput(value.showPrice),
    showBadge: coerceOptionalBooleanInput(value.showBadge),
    layout: coerceStringEnumInput(value.layout, ['vertical', 'horizontal'] as const),
    cardLayout: coerceStringEnumInput(value.cardLayout, ['standard', 'vertical', 'horizontal'] as const),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-product-card',
  imports: [BadgeComponent, ButtonComponent],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-product-card' },
})
export class ProductCardComponent {
  private readonly http = inject(HttpClient);

  private normalizeLayout(value: string | undefined): 'vertical' | 'horizontal' {
    switch ((value ?? '').trim().toLowerCase()) {
      case 'horizontal':
        return 'horizontal';
      case 'standard':
      case 'vertical':
      default:
        return 'vertical';
    }
  }

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<Partial<ProductCardElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ProductCardElementConfig>(sanitizeProductCardConfig),
  });
  readonly productSkuInput = input<string | undefined>(undefined, { alias: 'productSku' });
  readonly productUrlTemplateInput = input<string | undefined>(undefined, { alias: 'productUrlTemplate' });
  readonly layoutInput     = input<string | undefined>(undefined, { alias: 'layout' });
  readonly cardLayoutInput = input<string | undefined>(undefined, { alias: 'cardLayout' });
  readonly themeInput      = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput    = input<string | undefined>(undefined, { alias: 'variant' });
  readonly variantKeyInput = input<string | undefined>(undefined, { alias: 'variantKey' });

  // ── Resolved config values ────────────────────────────────────────────────
  readonly productSku = computed(() =>
    resolveConfigValue(this.productSkuInput(), this.config()?.productSku, ''),
  );
  readonly productUrlTemplate = computed(() =>
    resolveConfigValue(this.productUrlTemplateInput(), this.config()?.productUrlTemplate, ''),
  );
  readonly layout = computed(() =>
    this.normalizeLayout(
      this.layoutInput()
      ?? this.cardLayoutInput()
      ?? this.config()?.layout
      ?? this.config()?.cardLayout,
    ),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput() ?? this.variantKeyInput(), this.config()?.variant ?? this.config()?.variantKey, 'default'),
  );
  readonly translations = computed(() => this.config()?.translations ?? {});

  // Editorial overrides (used when API data is not available or not yet loaded)
  readonly editorialName     = computed(() => this.config()?.name     ?? '');
  readonly editorialImageSrc = computed(() => this.config()?.imageSrc ?? '');
  readonly editorialImageAlt = computed(() => this.config()?.imageAlt ?? '');
  readonly showPrice         = computed(() => this.config()?.showPrice ?? true);
  readonly showBadge         = computed(() => this.config()?.showBadge ?? true);

  // ── API state ─────────────────────────────────────────────────────────────
  readonly product  = signal<Product | null>(null);
  readonly loading  = signal(false);
  readonly apiError = signal(false);

  // ── Derived product data (API first, editorial fallback) ──────────────────
  readonly name     = computed(() => this.product()?.name     ?? this.editorialName());
  readonly imageSrc = computed(() => this.product()?.images?.[0]?.src ?? this.editorialImageSrc());
  readonly imageAlt = computed(() => this.product()?.images?.[0]?.alt ?? this.editorialImageAlt());
  readonly price    = computed(() => this.product()?.price);
  readonly originalPrice = computed(() => this.product()?.originalPrice);
  readonly discount = computed(() => this.product()?.discount);
  readonly inStock  = computed(() => this.product()?.inStock ?? true);
  readonly badge    = computed(() => this.product()?.badge ?? '');
  readonly currency = computed(() => this.product()?.currency ?? 'COP');
  readonly productUrl = computed(() => {
    const product = this.product();
    if (!product) {
      return null;
    }

    return this.resolveProductUrl(product);
  });

  // ── Computed display state ────────────────────────────────────────────────
  readonly hasImage     = computed(() => this.imageSrc().length > 0);
  readonly hasPrice     = computed(() => this.showPrice() && this.price() != null);
  readonly hasDiscount  = computed(() => (this.discount() ?? 0) > 0);
  readonly hasBadge     = computed(() => this.showBadge() && this.badge().length > 0);
  readonly hostClasses  = computed(
    () => `sg-product-card--${this.layout()} sg-product-card--${this.theme()} sg-product-card--${this.variant()}`,
  );

  // ── Translations helpers ─────────────────────────────────────────────────
  readonly t = computed(() => this.translations());
  readonly addToCartLabel = computed(
    () => this.t()['Shop.Product.AddToCart'] ?? 'Add to cart',
  );
  readonly outOfStockLabel = computed(
    () => this.t()['Shop.Product.OutOfStock'] ?? 'Out of stock',
  );
  readonly inStockLabel = computed(
    () => this.t()['Shop.Product.InStock'] ?? 'In stock',
  );
  readonly viewDetailsLabel = computed(
    () => this.t()['Shop.Product.ViewDetails'] ?? 'View details',
  );
  readonly loadingProductLabel = computed(
    () => this.t()['Shop.Product.Loading'] ?? 'Loading product...',
  );

  // ── Fetch product on SKU change ───────────────────────────────────────────
  constructor() {
    effect(() => {
      const sku = this.productSku();
      if (!sku) return;

      this.loading.set(true);
      this.apiError.set(false);

      this.http
        .get<Product>(`/api/shop/products/sku/${encodeURIComponent(sku)}`)
        .subscribe({
          next:  (p) => { this.product.set(p); this.loading.set(false); },
          error: ()  => { this.apiError.set(true); this.loading.set(false); },
        });
    });
  }

  // ── Cart interaction ──────────────────────────────────────────────────────
  addToCart(): void {
    const p = this.product();
    if (!p || !p.inStock) return;

    window.dispatchEvent(
      new CustomEvent('sg:product:addToCart', {
        bubbles:   true,
        composed:  true,
        detail: {
          productId: p.id,
          productSku: p.sku,
          name:      p.name,
          price:     p.price,
          currency:  p.currency,
          image:     p.images?.[0]?.src,
          quantity:  1,
        },
      }),
    );
  }

  onProductLinkClick(event: MouseEvent, source: 'image' | 'title' | 'details-link'): void {
    const product = this.product();
    const productUrl = this.productUrl();
    if (!product || !productUrl) {
      event.preventDefault();
      return;
    }

    const allowDefaultNavigation = this.dispatchProductSelected(product, productUrl, source);
    if (!allowDefaultNavigation) {
      event.preventDefault();
    }
  }

  // ── Price formatter ───────────────────────────────────────────────────────
  formatPrice(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style:    'currency',
      currency: this.currency(),
      maximumFractionDigits: 0,
    }).format(value);
  }

  viewDetailsAriaLabel(): string {
    const productName = this.name();
    if (!productName) {
      return this.viewDetailsLabel();
    }

    return `${this.viewDetailsLabel()} - ${productName}`;
  }

  private resolveProductUrl(product: Product): string | null {
    const template = this.productUrlTemplate().trim();
    if (!template) {
      return null;
    }

    return template
      .replaceAll('{id}', encodeURIComponent(product.id))
      .replaceAll('{sku}', encodeURIComponent(product.sku))
      .replaceAll('{slug}', encodeURIComponent(product.slug));
  }

  private dispatchProductSelected(
    product: Product,
    productUrl: string,
    source: 'image' | 'title' | 'details-link',
  ): boolean {
    return window.dispatchEvent(
      new CustomEvent('sg:product:selected', {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: {
          productId: product.id,
          productSku: product.sku,
          productSlug: product.slug,
          productUrl,
          source,
        },
      }),
    );
  }
}
