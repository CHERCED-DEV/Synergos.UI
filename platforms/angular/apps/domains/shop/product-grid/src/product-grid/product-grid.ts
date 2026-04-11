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
  coerceConfigInput,
  resolveConfigValue,
  SkeletonComponent,
  EmptyStateComponent,
  BadgeComponent,
  ButtonComponent,
  SelectComponent,
} from '@synergos/shared';

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

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<Partial<ProductGridElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<ProductGridElementConfig>,
  });

  readonly headingTextInput    = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly categoryAliasInput  = input<string | undefined>(undefined, { alias: 'categoryAlias' });
  readonly maxItemsInput       = input<number | undefined>(undefined, { alias: 'maxItems' });
  readonly columnsInput        = input<number | undefined>(undefined, { alias: 'columns' });
  readonly showFiltersInput    = input<boolean | undefined>(undefined, { alias: 'showFilters' });
  readonly themeInput          = input<string | undefined>(undefined, { alias: 'theme' });

  // ── Config resolution ─────────────────────────────────────────────────────
  readonly headingText   = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly categoryAlias = computed(() =>
    resolveConfigValue(this.categoryAliasInput(), this.config()?.categoryAlias, ''),
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
  readonly activeSort   = signal<string>(this.config()?.sortOrder ?? 'relevance');
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
  readonly sortOptions = computed(() => [
    { value: 'relevance',   label: this.t()['Shop.Filter.Relevance'] ?? 'Relevance' },
    { value: 'newest',      label: this.t()['Shop.Filter.Newest']    ?? 'Newest' },
    { value: 'price-asc',   label: this.t()['Shop.Filter.PriceLow']  ?? 'Price: Low to high' },
    { value: 'price-desc',  label: this.t()['Shop.Filter.PriceHigh'] ?? 'Price: High to low' },
  ]);
  readonly filterClearLabel    = computed(() => this.t()['Shop.Filter.Clear']        || 'Clear filters');
  readonly addToCartLabel      = computed(() => this.t()['Shop.Product.AddToCart']   || 'Add to cart');
  readonly outOfStockLabel     = computed(() => this.t()['Shop.Product.OutOfStock']  || 'Out of stock');
  readonly tryDifferentLabel   = computed(() => this.t()['Shop.Filter.TryDifferent'] || 'Try a different search term.');

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

  formatPrice(value: number, currency: string): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  }

  trackById(_: number, p: Product): string { return p.id; }
}
