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
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

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

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<Partial<ProductCardElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<ProductCardElementConfig>,
  });
  readonly productSkuInput = input<string | undefined>(undefined, { alias: 'productSku' });
  readonly layoutInput     = input<string | undefined>(undefined, { alias: 'layout' });
  readonly themeInput      = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput    = input<string | undefined>(undefined, { alias: 'variant' });

  // ── Resolved config values ────────────────────────────────────────────────
  readonly productSku = computed(() =>
    resolveConfigValue(this.productSkuInput(), this.config()?.productSku, ''),
  );
  readonly layout = computed(() =>
    resolveConfigValue(this.layoutInput(), this.config()?.layout, 'vertical'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
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

  // ── Price formatter ───────────────────────────────────────────────────────
  formatPrice(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style:    'currency',
      currency: this.currency(),
      maximumFractionDigits: 0,
    }).format(value);
  }
}
