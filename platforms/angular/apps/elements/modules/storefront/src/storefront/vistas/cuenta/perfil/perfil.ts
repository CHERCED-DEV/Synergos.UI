import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CompraDeLaTienda } from '@synergos/dominio/tienda';
import { InputComponent, SynStatusBannerComponent } from '@synergos/shared';

/** «Mis datos» (014-despiece-tienda, T010): los que prellenan el pago, y se pueden cambiar. */
@Component({
  selector: 'sg-tienda-cuenta-perfil',
  standalone: true,
  imports: [InputComponent, SynStatusBannerComponent],
  templateUrl: './perfil.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaCuentaPerfilComponent {
  protected readonly compra = inject(CompraDeLaTienda);
}
