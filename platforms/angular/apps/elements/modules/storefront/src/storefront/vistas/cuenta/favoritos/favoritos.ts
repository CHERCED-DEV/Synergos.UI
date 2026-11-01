import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DeseosDeLaTienda, type WishlistEntry } from '@synergos/dominio/tienda';
import { ButtonComponent } from '@synergos/shared';
import { NavegacionDeLaTienda } from '../../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../../estado/presentacion';

/** Los favoritos de «Mi cuenta» (014-despiece-tienda, T010): verlos y quitarlos. */
@Component({
  selector: 'sg-tienda-cuenta-favoritos',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './favoritos.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaCuentaFavoritosComponent {
  protected readonly deseos = inject(DeseosDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  openWishlistEntry(entry: WishlistEntry): void {
    this.navegacion.navigate('pdp', entry.productId);
  }
}
