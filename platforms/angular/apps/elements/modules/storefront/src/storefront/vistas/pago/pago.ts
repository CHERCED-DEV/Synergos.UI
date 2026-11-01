import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { CarritoDeLaTienda, CompraDeLaTienda } from '@synergos/dominio/tienda';
import { ButtonComponent, InputComponent, RadioComponent, SynStatusBannerComponent } from '@synergos/shared';
import { CheckoutWizardComponent } from '@synergos/shells';
import { CompraEnLaPagina } from '../../estado/compra-en-la-pagina';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../estado/presentacion';

/** El pago sobre SH-3: los datos de envío, el medio de pago y la revisión, contra el motor de transacciones. */
@Component({
  selector: 'sg-tienda-pago',
  standalone: true,
  imports: [CheckoutWizardComponent, SynStatusBannerComponent, ButtonComponent, InputComponent, RadioComponent],
  templateUrl: './pago.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaPagoComponent {
  protected readonly carrito = inject(CarritoDeLaTienda);
  protected readonly compra = inject(CompraDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly pagina = inject(CompraEnLaPagina);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

}
