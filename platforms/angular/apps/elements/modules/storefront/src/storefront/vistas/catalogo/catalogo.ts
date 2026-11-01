import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import {
  AvisosDeLaTienda,
  CarritoDeLaTienda,
  CatalogoDeLaTienda,
  DeseosDeLaTienda,
  type ShopProduct,
  type SortKey,
} from '@synergos/dominio/tienda';
import {
  BadgeComponent,
  ButtonComponent,
  IconButtonComponent,
  LinkComponent,
  StatusTagComponent,
} from '@synergos/shared';
import {
  type CompareAttribute,
  type CompareCandidate,
  type CompareRejection,
  CompareSelection,
  CompareTableComponent,
  type CompareTableConfig,
  DiscoveryShellComponent,
} from '@synergos/shells';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { CONDITION_LABELS, PresentacionDeLaTienda } from '../../estado/presentacion';

const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
];

/** El catálogo: la búsqueda facetada sobre SH-1 y la comparación de productos (SH-14). */
@Component({
  selector: 'sg-tienda-catalogo',
  standalone: true,
  imports: [DiscoveryShellComponent, CompareTableComponent, BadgeComponent, ButtonComponent, IconButtonComponent, LinkComponent, StatusTagComponent],
  templateUrl: './catalogo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaCatalogoComponent {
  protected readonly avisos = inject(AvisosDeLaTienda);
  protected readonly carrito = inject(CarritoDeLaTienda);
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly deseos = inject(DeseosDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  readonly sortOptions = SORT_OPTIONS;

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
    const product = this.catalogo.products().find((item) => item.id === candidate.id);
    if (product) {
      this.navegacion.openProduct(product);
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
      price: this.presentacion.productPriceLabel(product),
      listPrice: this.presentacion.productListPriceLabel(product),
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
      headline: this.presentacion.productPriceLabel(product),
      imageUrl: product.images[0] || undefined,
      values,
    };
  }
}
