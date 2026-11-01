import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { ButtonComponent } from '@synergos/shared';
import { DespachoDeLaConsola } from '../../../estado/despacho';
import { EstadoDeLaConsola } from '../../../estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from '../../../estado/presentacion';
import { ReembolsosDeLaConsola } from '../../../estado/reembolsos';

/** Confirmar un reembolso antes de mandarlo: mueve plata. (014-despiece-tienda, T011) */
@Component({
  selector: 'sg-consola-reembolso',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './reembolso.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConsolaReembolsoComponent {
  protected readonly despacho = inject(DespachoDeLaConsola);
  protected readonly estado = inject(EstadoDeLaConsola);
  protected readonly presentacion = inject(PresentacionDeLaConsola);
  protected readonly reembolsos = inject(ReembolsosDeLaConsola);
}
