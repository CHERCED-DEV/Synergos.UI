import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DevolucionesDeLaTienda, MOTIVOS_DE_DEVOLUCION, type ShopOrder } from '@synergos/dominio/tienda';
import { ButtonComponent, LinkComponent, RadioComponent } from '@synergos/shared';
import { PresentacionDeLaTienda } from '../../../../estado/presentacion';

/**
 * Pedir la devolución de una línea de la compra abierta (014-despiece-tienda, T010): el motivo, entre los del dominio,
 * y el envío. Lo que conteste el servidor lo dice aquí mismo.
 */
@Component({
  selector: 'sg-tienda-cuenta-devolucion',
  standalone: true,
  imports: [ButtonComponent, LinkComponent, RadioComponent],
  templateUrl: './devolucion.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaCuentaDevolucionComponent {
  protected readonly devoluciones = inject(DevolucionesDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  /** La compra de la línea que se devuelve: el formulario sólo se pinta en la suya. */
  readonly pedido = input.required<ShopOrder>();

  readonly returnReasons = MOTIVOS_DE_DEVOLUCION;
}
