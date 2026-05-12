import type { ProductGridElementConfig, Product, ProductListResponse } from '@synergos/contracts';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceStringEnumInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  SkeletonComponent,
  EmptyStateComponent,
  BadgeComponent,
  ButtonComponent,
  SelectComponent,
} from '@synergos/shared';

function sanitizePositiveInteger(value: unknown): number | undefined {
  const coercedValue = coerceOptionalNumberInput(value);
  if (coercedValue === undefined || coercedValue < 1) {
    return undefined;
  }

  return Math.trunc(coercedValue);
}

function sanitizeProductGridConfig(
  value: Partial<ProductGridElementConfig>,
): Partial<ProductGridElementConfig> {
  return omitUndefinedProperties<ProductGridElementConfig>({
    headingText: coerceTrimmedStringInput(value.headingText),
    categoryAlias: coerceTrimmedStringInput(value.categoryAlias),
    categoryFilter: coerceTrimmedStringInput(value.categoryFilter),
    productUrlTemplate: coerceTrimmedStringInput(value.productUrlTemplate),
    maxItems: sanitizePositiveInteger(value.maxItems),
    columns: coerceStringEnumInput(String(value.columns ?? ''), ['2', '3', '4'] as const) ? Number(value.columns) as 2 | 3 | 4 : undefined,
    showFilters: coerceOptionalBooleanInput(value.showFilters),
    sortOrder: coerceStringEnumInput(value.sortOrder, ['relevance', 'newest', 'price-asc', 'price-desc'] as const),
    sortBy: coerceStringEnumInput(value.sortBy, ['name', 'relevance', 'newest', 'price-asc', 'price-desc'] as const),
    layout: coerceStringEnumInput(value.layout, ['grid', 'list'] as const),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-product-grid',
  imports: [SkeletonComponent, EmptyStateComponent, BadgeComponent, ButtonComponent, SelectComponent],
  templateUrl: './product-grid.html',
  styleUrl: './product-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-product-grid' },
})
export class ProductGridComponent {
  private readonly http = inject(HttpClient);
  readonly headingId = `sg-product-grid-heading-${Math.random().toString(36).slice(2, 10)}`;

  private normalizeSort(value: string | undefined): string {
    switch ((value ?? '').trim().toLowerCase()) {
      case 'newest':
      case 'price-asc':
      case 'price-desc':
      case 'relevance':
        return (value ?? '').trim().toLowerCase();
      case 'name':
      default:
        return 'relevance';
    }
  }

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<Partial<ProductGridElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ProductGridElementConfig>(sanitizeProductGridConfig),
  });

  readonly headingTextInput    = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly categoryAliasInput  = input<string | undefined>(undefined, { alias: 'categoryAlias' });
  readonly categoryFilterInput = input<string | undefined>(undefined, { alias: 'categoryFilter' });
  readonly productUrlTemplateInput = input<string | undefined>(undefined, { alias: 'productUrlTemplate' });
  readonly maxItemsInput       = input<number | undefined>(undefined, { alias: 'maxItems' });
  readonly columnsInput        = input<number | undefined>(undefined, { alias: 'columns' });
  readonly showFiltersInput    = input<boolean | undefined>(undefined, { alias: 'showFilters' });
  readonly sortOrderInput      = input<string | undefined>(undefined, { alias: 'sortOrder' });
  readonly sortByInput         = input<string | undefined>(undefined, { alias: 'sortBy' });
  readonly themeInput          = input<string | undefined>(undefined, { alias: 'theme' });

  // ── Config resolution ─────────────────────────────────────────────────────
  readonly headingText   = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly categoryAlias = computed(() =>
    resolveConfigValue(this.categoryAliasInput() ?? this.categoryFilterInput(), this.config()?.categoryAlias ?? this.config()?.categoryFilter, ''),
  );
  readonly productUrlTemplate = computed(() =>
    resolveConfigValue(this.productUrlTemplateInput(), this.config()?.productUrlTemplate, ''),
  );
  readonly maxItems = computed(() =>
    resolveConfigValue(this.maxItemsInput(), this.config()?.maxItems, 12),
  );
  readonly columns = computed(() =>
    resolveConfigValue(this.columnsInput(), this.config()?.columns, 3),
  );
  readonly showFilters = computed(() =>
    resolveConfigValue(this.showFiltersInput(), this.config()?.showFilters, false),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly translations = computed(() => this.config()?.translations ?? {});

  // ── Filter state (local) ──────────────────────────────────────────────────
  readonly searchQuery  = signal('');
  readonly activeSort   = signal<string>(this.normalizeSort(this.config()?.sortOrder ?? this.config()?.sortBy));
  readonly currentPage  = signal(1);

  // ── API state ─────────────────────────────────────────────────────────────
  readonly products  = signal<Product[]>([]);
  readonly total     = signal(0);
  readonly totalPages = signal(1);
  readonly loading   = signal(false);
  readonly apiError  = signal(false);

  // ── Computed display state ────────────────────────────────────────────────
  readonly hasHeading   = computed(() => this.headingText().length > 0);
  readonly isEmpty      = computed(() => !this.loading() && this.products().length === 0);
  readonly gridColumns  = computed(() => Math.min(4, Math.max(2, this.columns())));
  readonly gridClass    = computed(
    () => `sg-product-grid--cols-${this.gridColumns()} sg-product-grid--${this.theme()}`,
  );

  // ── Translation helpers ───────────────────────────────────────────────────
  readonly t            = computed(() => this.translations());
  readonly noResultsLabel = computed(() => this.t()['Shop.Filter.NoResults'] ?? 'No products found.');
  readonly sortByLabel    = computed(() => this.t()['Shop.Filter.SortBy']    ?? 'Sort by');
  readonly searchProductsLabel = computed(() => this.t()['Shop.Filter.Search'] ?? 'Search products');
  readonly searchPlaceholder = computed(
    () => this.t()['Shop.Filter.SearchPlaceholder'] ?? 'Search products...',
  );
  readonly productsRegionLabel = computed(
    () => this.t()['Shop.Filter.ResultsRegion'] ?? 'Product results',
  );
  readonly loadingProductsLabel = computed(
    () => this.t()['Shop.Filter.Loading'] ?? 'Loading products',
  );
  readonly loadingErrorLabel = computed(
    () => this.t()['Shop.Filter.Error'] ?? 'Error loading products. Please try again.',
  );
  readonly ratingOutOfLabel = computed(
    () => this.t()['Shop.Product.RatingOutOf'] ?? 'out of 5',
  );
  readonly sortOptions = computed(() => [
    { value: 'relevance',   label: this.t()['Shop.Filter.Relevance'] ?? 'Relevance' },
    { value: 'newest',      label: this.t()['Shop.Filter.Newest']    ?? 'Newest' },
    { value: 'price-asc',   label: this.t()['Shop.Filter.PriceLow']  ?? 'Price: Low to high' },
    { value: 'price-desc',  label: this.t()['Shop.Filter.PriceHigh'] ?? 'Price: High to low' },
  ]);
  readonly filterClearLabel    = computed(() => this.t()['Shop.Filter.Clear']        || 'Clear filters');
  readonly addToCartLabel      = computed(() => this.t()['Shop.Product.AddToCart']   || 'Add to cart');
  readonly outOfStockLabel     = computed(() => this.t()['Shop.Product.OutOfStock']  || 'Out of stock');
  readonly viewDetailsLabel    = computed(() => this.t()['Shop.Product.ViewDetails'] || 'View details');
  readonly tryDifferentLabel   = computed(() => this.t()['Shop.Filter.TryDifferent'] || 'Try a different search term.');
  readonly paginationLabel     = computed(() => this.t()['Shop.Filter.Pagination']   ?? 'Pagination');
  readonly previousPageLabel   = computed(() => this.t()['Shop.Filter.Previous']     ?? 'Previous');
  readonly nextPageLabel       = computed(() => this.t()['Shop.Filter.Next']         ?? 'Next');
  readonly pageLabel           = computed(() => this.t()['Shop.Filter.Page']         ?? 'Page');
  readonly pageStatusLabel     = computed(() =>
    (this.t()['Shop.Filter.PageStatus'] ?? '{page} {current} of {total}')
      .replace('{page}', this.pageLabel())
      .replace('{current}', String(this.currentPage()))
      .replace('{total}', String(this.totalPages())),
  );
  readonly canGoPrevious       = computed(() => this.currentPage() > 1);
  readonly canGoNext           = computed(() => this.currentPage() < this.totalPages());

  // ── Fetch products when filters change ────────────────────────────────────
  constructor() {
    effect(() => {
      const category = this.categoryAlias();
      const sort     = this.activeSort();
      const search   = this.searchQuery();
      const page     = this.currentPage();
      const pageSize = this.maxItems();

      this.loading.set(true);
      this.apiError.set(false);

      let params = new HttpParams()
        .set('page',     String(page))
        .set('pageSize', String(pageSize))
        .set('sort',     sort);

      if (category) params = params.set('category', category);
      if (search)   params = params.set('search',   search);

      this.http
        .get<ProductListResponse>('/api/shop/products', { params })
        .subscribe({
          next: (res) => {
            this.products.set(res.items);
            this.total.set(res.total);
            this.totalPages.set(res.totalPages);
            this.loading.set(false);
          },
          error: () => {
            this.apiError.set(true);
            this.loading.set(false);
          },
        });
    });
  }

  // ── Interactions ──────────────────────────────────────────────────────────
  onSortChange(value: string): void {
    this.activeSort.set(value);
    this.currentPage.set(1);
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.activeSort.set('relevance');
    this.currentPage.set(1);
  }

  previousPage(): void {
    if (!this.canGoPrevious()) {
      return;
    }

    this.currentPage.update((page) => Math.max(1, page - 1));
  }

  nextPage(): void {
    if (!this.canGoNext()) {
      return;
    }

    this.currentPage.update((page) => Math.min(this.totalPages(), page + 1));
  }

  addToCart(product: Product): void {
    if (!product.inStock) return;
    window.dispatchEvent(
      new CustomEvent('sg:product:addToCart', {
        bubbles: true, composed: true,
        detail: {
          productId: product.id,
          productSku: product.sku,
          name:      product.name,
          price:     product.price,
          currency:  product.currency,
          image:     product.images?.[0]?.src,
          quantity:  1,
        },
      }),
    );
  }

  onProductLinkClick(
    event: MouseEvent,
    product: Product,
    productUrl: string,
    source: 'image' | 'title' | 'details-link',
  ): void {
    const allowDefaultNavigation = this.dispatchProductSelected(product, productUrl, source);
    if (!allowDefaultNavigation) {
      event.preventDefault();
    }
  }

  resolveProductUrl(product: Product): string | null {
    const template = this.productUrlTemplate().trim();
    if (!template) {
      return null;
    }

    return template
      .replaceAll('{id}', encodeURIComponent(product.id))
      .replaceAll('{sku}', encodeURIComponent(product.sku))
      .replaceAll('{slug}', encodeURIComponent(product.slug));
  }

  formatPrice(value: number, currency: string): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  }

  trackById(_: number, p: Product): string { return p.id; }

  ratingAriaLabel(product: Product): string {
    if (!product.rating) {
      return '';
    }

    return `Rating ${product.rating.average} ${this.ratingOutOfLabel()}`;
  }

  addToCartAriaLabel(product: Product): string {
    if (!product.inStock) {
      return `${this.outOfStockLabel()} - ${product.name}`;
    }

    return `${this.addToCartLabel()} - ${product.name}`;
  }

  viewDetailsAriaLabel(product: Product): string {
    return `${this.viewDetailsLabel()} - ${product.name}`;
  }

  private dispatchProductSelected(
    product: Product,
    productUrl: string | null,
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
