import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CatalogoDeLaTienda } from '@synergos/dominio/tienda';
import { BadgeComponent, ButtonComponent, IconButtonComponent, InputComponent, LinkComponent } from '@synergos/shared';
import { type DiscoveryCriteria } from '@synergos/shells';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../estado/presentacion';

const CLEAN_CRITERIA: DiscoveryCriteria = { term: '', facets: {}, sort: 'relevance', page: 1 };

/** La portada de la tienda: el buscador del héroe, las ofertas, lo mejor valorado y las categorías. */
@Component({
  selector: 'sg-tienda-inicio',
  standalone: true,
  imports: [NgTemplateOutlet, BadgeComponent, ButtonComponent, IconButtonComponent, InputComponent, LinkComponent],
  templateUrl: './inicio.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaInicioComponent {
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  readonly heading = input('');

  readonly subheading = input('');

  readonly homeTerm = signal('');

  // ─── Home ────────────────────────────────────────────────────────────────────
  submitHomeSearch(): void {
    const term = this.homeTerm().trim();
    this.catalogo.criteria.set({ ...CLEAN_CRITERIA, term });
    this.navegacion.navigate('plp');
    void this.catalogo.runSearch();
  }

  openCategory(category: string): void {
    this.catalogo.criteria.set({ ...CLEAN_CRITERIA, facets: { category: [category] } });
    this.navegacion.navigate('plp');
    void this.catalogo.runSearch();
  }
}
