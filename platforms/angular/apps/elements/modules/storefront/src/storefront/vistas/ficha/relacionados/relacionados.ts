import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogoDeLaTienda } from '@synergos/dominio/tienda';
import { ButtonComponent, LinkComponent } from '@synergos/shared';
import { NavegacionDeLaTienda } from '../../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../../estado/presentacion';

/** Lo que miraron quienes vieron este producto, al pie de la ficha (014-despiece-tienda, T010). */
@Component({
  selector: 'sg-tienda-ficha-relacionados',
  standalone: true,
  imports: [ButtonComponent, LinkComponent],
  templateUrl: './relacionados.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaFichaRelacionadosComponent {
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);
}
