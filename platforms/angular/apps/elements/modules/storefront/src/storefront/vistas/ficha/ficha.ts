import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { AvisosDeLaTienda, CatalogoDeLaTienda } from '@synergos/dominio/tienda';
import { SynErrorStateComponent, SynSkeletonComponent } from '@synergos/shared';
import { type DetailMedia, DetailShellComponent, type DetailSpec } from '@synergos/shells';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { CONDITION_LABELS } from '../../estado/presentacion';
import { TiendaFichaCompraComponent } from './compra/compra';
import { TiendaFichaOpinionesComponent } from './opiniones/opiniones';
import { TiendaFichaPreguntasComponent } from './preguntas/preguntas';
import { TiendaFichaRelacionadosComponent } from './relacionados/relacionados';

/**
 * La ficha de un producto sobre SH-2: la galería, la descripción y la ficha técnica. Cada ranura del shell es su
 * pieza: la compra con su variante y su cantidad, las opiniones, las preguntas y lo relacionado.
 */
@Component({
  selector: 'sg-tienda-ficha',
  standalone: true,
  imports: [
    DetailShellComponent,
    SynSkeletonComponent,
    SynErrorStateComponent,
    TiendaFichaCompraComponent,
    TiendaFichaOpinionesComponent,
    TiendaFichaPreguntasComponent,
    TiendaFichaRelacionadosComponent,
  ],
  templateUrl: './ficha.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaFichaComponent {
  protected readonly avisos = inject(AvisosDeLaTienda);
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);

  readonly pdpMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.catalogo.detail();
    if (!detail) {
      return [];
    }
    return detail.product.images.map((url) => ({ url, alt: detail.product.title }));
  });

  readonly pdpEyebrow = computed(() => {
    const product = this.catalogo.detail()?.product;
    if (!product) {
      return '';
    }
    return `${CONDITION_LABELS[product.condition]} · ${product.brand}`;
  });

  readonly pdpSpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.catalogo.detail();
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
    const variant = this.catalogo.selectedVariant();
    if (variant) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        specs.push({ label: key, value });
      }
    }
    return specs;
  });
}
