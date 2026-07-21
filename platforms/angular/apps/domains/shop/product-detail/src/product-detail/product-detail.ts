import type { ProductDetailElementConfig, Product, ProductVariant } from '@synergos/contracts';
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
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  SkeletonComponent,
  BadgeComponent,
  ButtonComponent,
} from '@synergos/shared';
import {
  PriceDisplayComponent,
  QuantitySelectorComponent,
  VariantPickerComponent,
} from '@synergos/shop';

function sanitizeProductDetailConfig(
  value: Partial<ProductDetailElementConfig>,
): Partial<ProductDetailElementConfig> {
  return omitUndefinedProperties<ProductDetailElementConfig>({
    productSku: coerceTrimmedStringInput(value.productSku),
    showVariantPicker: coerceOptionalBooleanInput(value.showVariantPicker),
    showQuantitySelector: coerceOptionalBooleanInput(value.showQuantitySelector),
    showRating: coerceOptionalBooleanInput(value.showRating),
    showReviews: coerceOptionalBooleanInput(value.showReviews),
    showRelated: coerceOptionalBooleanInput(value.showRelated),
    layout: coerceStringEnumInput(value.layout, ['imageleft', 'imageright', 'imagetop'] as const)?.replace('imageleft', 'imageLeft').replace('imageright', 'imageRight').replace('imagetop', 'imageTop') as ProductDetailElementConfig['layout'] | undefined,
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-product-detail',
  imports: [PriceDisplayComponent, QuantitySelectorComponent, VariantPickerComponent,
            SkeletonComponent, BadgeComponent, ButtonComponent],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-product-detail' },
})
export class ProductDetailComponent {
  private readonly http = inject(HttpClient);
  readonly quantityLabelId = `sg-product-detail-qty-label-${Math.random().toString(36).slice(2, 10)}`;

  // â”€â”€ Inputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly config = input<Partial<ProductDetailElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ProductDetailElementConfig>(sanitizeProductDetailConfig),
  });

  readonly productSkuInput           = input<string | undefined>(undefined, { alias: 'productSku' });
  readonly showVariantPickerInput    = input<boolean | undefined>(undefined, { alias: 'showVariantPicker' });
  readonly showQuantitySelectorInput = input<boolean | undefined>(undefined, { alias: 'showQuantitySelector' });
  readonly showRatingInput           = input<boolean | undefined>(undefined, { alias: 'showRating' });
  readonly layoutInput               = input<string | undefined>(undefined, { alias: 'layout' });
  readonly themeInput                = input<string | undefined>(undefined, { alias: 'theme' });

  // â”€â”€ Resolved config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly productSku = computed(() =>
    resolveConfigValue(this.productSkuInput(), this.config()?.productSku, ''),
  );
  readonly showVariantPicker = computed(() =>
    resolveConfigValue(this.showVariantPickerInput(), this.config()?.showVariantPicker, true),
  );
  readonly showQuantitySelector = computed(() =>
    resolveConfigValue(this.showQuantitySelectorInput(), this.config()?.showQuantitySelector, true),
  );
  readonly showRating = computed(() =>
    resolveConfigValue(this.showRatingInput(), this.config()?.showRating, true),
  );
  readonly layout = computed(() =>
    resolveConfigValue(this.layoutInput(), this.config()?.layout, 'imageLeft'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly translations = computed(() => this.config()?.translations ?? {});

  // â”€â”€ API state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly product  = signal<Product | null>(null);
  readonly loading  = signal(false);
  readonly apiError = signal(false);

  // â”€â”€ Cart / selection state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly quantity        = signal(1);
  readonly selectedVariant = signal<ProductVariant | null>(null);
  readonly activeImageIdx  = signal(0);

  // â”€â”€ Derived display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly images         = computed(() => this.product()?.images ?? []);
  readonly activeImage    = computed(() => this.images()[this.activeImageIdx()] ?? null);
  readonly variants       = computed(() => this.product()?.variants ?? []);
  readonly hasVariants    = computed(() => this.variants().length > 0 && this.showVariantPicker());
  readonly hasRating      = computed(() => !!this.product()?.rating && this.showRating());
  readonly hasDiscount    = computed(() => (this.product()?.discount ?? 0) > 0);
  readonly inStock        = computed(() => {
    const v = this.selectedVariant();
    return v ? v.inStock : (this.product()?.inStock ?? false);
  });
  readonly effectivePrice = computed(() => {
    const v = this.selectedVariant();
    return (v?.price ?? this.product()?.price) ?? 0;
  });
  readonly stockQty       = computed(() => this.product()?.stockQty);
  readonly lowStock       = computed(() => {
    const qty = this.stockQty();
    return qty != null && qty > 0 && qty <= 5;
  });
  readonly hostClasses    = computed(
    () => `sg-product-detail--${this.layout()} sg-product-detail--${this.theme()}`,
  );

  // â”€â”€ Translation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly t                = computed(() => this.translations());
  readonly addToCartLabel   = computed(() => this.t()['Shop.Product.AddToCart']       ?? 'Add to cart');
  readonly outOfStockLabel  = computed(() => this.t()['Shop.Product.OutOfStock']      ?? 'Out of stock');
  readonly inStockLabel     = computed(() => this.t()['Shop.Product.InStock']         ?? 'In stock');
  readonly lowStockLabel    = computed(() => this.t()['Shop.Product.LowStock']        ?? 'Low stock');
  readonly skuLabel         = computed(() => this.t()['Shop.Product.Sku']             ?? 'SKU');
  readonly ratingLabel      = computed(() => this.t()['Shop.Product.Rating']          ?? 'Rating');
  readonly quantityLabel    = computed(() => this.t()['Shop.Product.Quantity']        ?? 'Quantity');
  readonly selectVariantLabel = computed(() => this.t()['Shop.Product.SelectVariant'] ?? 'Select variant');
  readonly productImagesLabel = computed(() => this.t()['Shop.Product.Images'] ?? 'Product images');
  readonly ratingOutOfLabel = computed(() => this.t()['Shop.Product.RatingOutOf'] ?? 'out of 5');
  readonly stockRemainingLabel = computed(() => this.t()['Shop.Product.StockRemaining'] ?? 'left');
  readonly loadingProductLabel = computed(() => this.t()['Shop.Product.Loading'] ?? 'Loading product...');
  readonly loadingErrorLabel = computed(
    () => this.t()['Shop.Product.LoadError'] ?? 'Error loading product. Please try again.',
  );

  // â”€â”€ Fetch on SKU change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  constructor() {
    effect(() => {
      const sku = this.productSku();
      if (!sku) return;

      this.loading.set(true);
      this.apiError.set(false);
      this.selectedVariant.set(null);
      this.activeImageIdx.set(0);
      this.quantity.set(1);

      this.http
        .get<Product>(`/api/shop/products/sku/${encodeURIComponent(sku)}`)
        .subscribe({
          next:  (p) => { this.product.set(p); this.loading.set(false); },
          error: ()  => { this.apiError.set(true); this.loading.set(false); },
        });
    });
  }

  // â”€â”€ Interactions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  onVariantSelected(variant: ProductVariant | null): void {
    this.selectedVariant.set(variant);
    if (variant?.image) {
      const idx = this.images().findIndex((img) => img.src === variant.image);
      if (idx >= 0) this.activeImageIdx.set(idx);
    }
  }

  onQuantityChange(qty: number): void {
    this.quantity.set(qty);
  }

  selectImage(idx: number): void {
    this.activeImageIdx.set(idx);
  }

  addToCart(): void {
    const p = this.product();
    if (!p || !this.inStock()) return;

    const variant = this.selectedVariant();

    window.dispatchEvent(
      new CustomEvent('sg:product:addToCart', {
        bubbles: true, composed: true,
        detail: {
          productId:  p.id,
          productSku: variant?.sku ?? p.sku,
          name:       variant ? `${p.name} - ${variant.name}` : p.name,
          price:      this.effectivePrice(),
          currency:   p.currency,
          quantity:   this.quantity(),
          variantId:  variant?.id,
          image:      p.images?.[0]?.src,
        },
      }),
    );
  }

  formatPrice(value: number): string {
    const currency = this.product()?.currency ?? 'COP';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  }

  ratingStars(): readonly number[] {
    return Array.from({ length: 5 }, (_, i) => i + 1);
  }

  isStarFilled(star: number, avg: number): boolean {
    return star <= Math.round(avg);
  }

  ratingAriaLabel(avg: number): string {
    return `${this.ratingLabel()} ${avg} ${this.ratingOutOfLabel()}`;
  }

  addToCartAriaLabel(): string {
    const productName = this.product()?.name;
    if (!productName) {
      return this.addToCartLabel();
    }

    return `${this.addToCartLabel()} - ${productName}`;
  }
}


