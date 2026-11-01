import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { ButtonComponent, InputComponent, SynErrorStateComponent } from '@synergos/shared';
import { DespachoDeLaConsola } from '../../../estado/despacho';
import { EstadoDeLaConsola } from '../../../estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from '../../../estado/presentacion';

/** Un pedido abierto de la bandeja: su detalle (a dónde va y con quién) y la guía que pide «marcar enviado». (014-despiece-tienda, T011) */
@Component({
  selector: 'sg-consola-pedido',
  standalone: true,
  imports: [SynErrorStateComponent, ButtonComponent, InputComponent],
  templateUrl: './pedido.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'seller__vista' },
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConsolaPedidoComponent {
  protected readonly despacho = inject(DespachoDeLaConsola);
  protected readonly estado = inject(EstadoDeLaConsola);
  protected readonly presentacion = inject(PresentacionDeLaConsola);
}
