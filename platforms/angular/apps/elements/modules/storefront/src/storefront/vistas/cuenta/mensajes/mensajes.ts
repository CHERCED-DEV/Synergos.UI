import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MensajesDeLaTienda } from '@synergos/dominio/tienda';
import { SynStatusBannerComponent } from '@synergos/shared';

/** Los mensajes con vendedores de «Mi cuenta» (014-despiece-tienda, T010): por ahora, leer los hilos. */
@Component({
  selector: 'sg-tienda-cuenta-mensajes',
  standalone: true,
  imports: [SynStatusBannerComponent],
  templateUrl: './mensajes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaCuentaMensajesComponent {
  protected readonly mensajes = inject(MensajesDeLaTienda);
}
