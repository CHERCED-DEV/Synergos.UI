import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EstudioDeBlogs, SuscripcionDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent } from '@synergos/shared';
import { CheckoutWizardComponent, type CheckoutWizardConfig } from '@synergos/shells';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';

/** El fallo del asistente de suscripción: el `pay` es local, así que nunca hubo cobro (UI#91). */
const SUSCRIPCION_NO_PROCESADA = 'No pudimos procesar la suscripción. Intenta de nuevo.';

/**
 * Suscribirse a quien escribe (SH-3 `syn-checkout-wizard` sobre el motor): el plan, el pago y la confirmación.
 * Declarada y apagada (P5 A): la red no la abre mientras su pago no cobre de verdad.
 */
@Component({
  selector: 'sg-blogs-suscripcion',
  standalone: true,
  imports: [ButtonComponent, CheckoutWizardComponent],
  templateUrl: './suscripcion.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsSuscripcionComponent {
  protected readonly suscripcion = inject(SuscripcionDeBlogs);
  protected readonly estudio = inject(EstudioDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly subscribeConfig: CheckoutWizardConfig = {
    steps: [
      { id: 'plan', label: 'Plan' },
      { id: 'pago', label: 'Pago' },
      { id: 'revisar', label: 'Confirmar' },
    ],
    stepsLabel: 'Pasos de la suscripción',
    summaryHeading: 'Tu membresía',
    submitLabel: 'Suscribirme',
    processingLabel: 'Procesando…',
    // El fallo lo dice el ASISTENTE, una vez (UI#91): el `SUB-…` del `pay` es local y no
    // es un cobro.
    payFailedMessage: SUSCRIPCION_NO_PROCESADA,
    confirmFailedMessage: SUSCRIPCION_NO_PROCESADA,
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
    totalLabel: 'Total mensual',
  };
}
