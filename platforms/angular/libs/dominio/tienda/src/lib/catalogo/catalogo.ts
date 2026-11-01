import { Injectable, computed, inject, signal } from '@angular/core';
import { OrchestratorService } from '@synergos/transaction-engine';
import { AvisosDeLaTienda } from '../comun/avisos';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import { CatalogoApi } from './catalogo-api.client';
import type { Facet, ProductDetail, ProductVariant, SearchCriteria, ShopProduct, SortKey } from './catalogo.model';

/** Lo que pide la búsqueda de la tienda: término, facetas, orden y página. */
export interface CriteriosDelCatalogo {
  readonly term: string;
  readonly facets: Readonly<Record<string, readonly string[]>>;
  readonly sort: string;
  readonly page: number;
}

export const CRITERIOS_LIMPIOS: CriteriosDelCatalogo = { term: '', facets: {}, sort: 'relevance', page: 1 };

/** Los órdenes que el borde entiende; otro cualquiera es «relevancia». */
const ORDENES: readonly SortKey[] = ['relevance', 'price-asc', 'price-desc', 'newest'];

/**
 * El catálogo de una tienda (014-despiece-tienda, T008): lo que se busca y lo que se encontró, los rieles de la
 * portada, y la ficha abierta con la variante y la cantidad elegidas.
 */
@Injectable()
export class CatalogoDeLaTienda {
  readonly #api = inject(CatalogoApi);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #avisos = inject(AvisosDeLaTienda);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);

  // ─── Search / PLP (SH-1 inputs) ─────────────────────────────────────────────
  readonly criteria = signal<CriteriosDelCatalogo>(CRITERIOS_LIMPIOS);
  readonly products = signal<readonly ShopProduct[]>([]);
  /**
   * Total matches across all pages — feeds the shell's `[total]`, which is what turns
   * `pageCount` into something other than 1 once the backend starts paginating.
   */
  readonly total = signal(0);
  readonly discoveryFacets = signal<readonly Facet[]>([]);
  readonly searched = signal(false);

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

  readonly pdpInStock = computed(() => {
    const variant = this.selectedVariant();
    if (variant) {
      return variant.inStock && variant.stock > 0;
    }
    return this.detail()?.product.inStock ?? false;
  });

  /**
   * La moneda de lo que se muestra: la que trae cada precio de la API. No es configuración: sería
   * una segunda fuente para un dato del precio. Sin datos todavía, vacía (`formatPrice` pinta el
   * número solo).
   */
  readonly currency = computed(() => this.detail()?.product.currency || this.products()[0]?.currency || '');

  // ─── Search / PLP (SH-1 wiring) ──────────────────────────────────────────────
  onCriteriaChange(criteria: CriteriosDelCatalogo): void {
    this.criteria.set(criteria);
    void this.runSearch();
  }

  async runSearch(): Promise<void> {
    const active = this.criteria();
    const sort = ORDENES.find((key) => key === active.sort) ?? 'relevance';
    const criteria: SearchCriteria = {
      q: active.term,
      category: '',
      facets: active.facets,
      sort,
      page: active.page,
    };
    this.#avisos.loading.set(true);
    this.#avisos.errorMessage.set('');
    // Dedup concurrent identical searches via the orchestrator.
    const requestId = `search:${JSON.stringify(criteria)}`;
    try {
      const result = await this.#orchestrator.callApi(requestId, () =>
        this.#api.search(this.#config.apiBase(), criteria, this.currency(), this.#config.lecturasBase()),
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
      this.#avisos.errorMessage.set(this.#textos.busquedaCaida);
      void error;
    } finally {
      this.#avisos.loading.set(false);
    }
  }

  // ─── PDP (SH-2 wiring) ───────────────────────────────────────────────────────
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

  async loadProduct(id: string): Promise<void> {
    this.#pendingProductId = id;
    this.#avisos.loading.set(true);
    this.#avisos.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`product:${id}`, () =>
        this.#api.product(this.#config.apiBase(), id, this.currency(), this.#config.lecturasBase()),
      );
      this.detail.set(detail);
      const firstInStock =
        detail.variants.find((variant) => variant.inStock) ?? detail.variants[0] ?? null;
      this.selectedVariantId.set(firstInStock?.variantId ?? '');
      this.pdpQuantity.set(1);
    } catch (error) {
      this.#avisos.errorMessage.set(this.#textos.productoCaido);
      void error;
    } finally {
      this.#avisos.loading.set(false);
    }
  }
}
