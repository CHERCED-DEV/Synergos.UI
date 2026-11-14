import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogoDeLaTienda } from '@synergos/dominio/tienda';
import { TiendaVitrinaComponent } from '../../vitrina/vitrina';

/** Lo que miraron quienes vieron este producto, al pie de la ficha (014-despiece-tienda, T010). */
@Component({
  selector: 'sg-tienda-ficha-relacionados',
  standalone: true,
  imports: [TiendaVitrinaComponent],
  templateUrl: './relacionados.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaFichaRelacionadosComponent {
  protected readonly catalogo = inject(CatalogoDeLaTienda);
}
