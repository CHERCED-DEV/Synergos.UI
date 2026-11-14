import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { type ShopProduct } from '@synergos/dominio/tienda';
import { ButtonComponent, LinkComponent } from '@synergos/shared';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../estado/presentacion';

/**
 * Una fila de tarjetas de producto que llevan a su ficha (016-contenido-piezas): la pieza que la portada, los
 * relacionados de la ficha y el carrito vacío copiaban a mano. El precio de lista sale sólo si el producto lo tiene.
 */
@Component({
  selector: 'sg-tienda-vitrina',
  standalone: true,
  imports: [ButtonComponent, LinkComponent],
  templateUrl: './vitrina.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class TiendaVitrinaComponent {
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  /** Los productos, en el orden en que se muestran. */
  readonly productos = input<readonly ShopProduct[]>([]);
}
