import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { CompraDeLaTienda } from '@synergos/dominio/tienda';
import {
  type ConfirmationAction,
  ConfirmationShellComponent,
  type ConfirmationShellConfig,
  type ConfirmationStep,
} from '@synergos/shells';
import { CompraEnLaPagina } from '../../estado/compra-en-la-pagina';
import { NavegacionDeLaTienda } from '../../estado/navegacion';

/** La confirmación del pedido que quedó (SH-11). */
@Component({
  selector: 'sg-tienda-confirmacion',
  standalone: true,
  imports: [ConfirmationShellComponent],
  templateUrl: './confirmacion.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaConfirmacionComponent {
  protected readonly compra = inject(CompraDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly pagina = inject(CompraEnLaPagina);

  // ─── Checkout (SH-3 inputs) ─────────────────────────────────────────────────
  // Arrancan desde el host: con sesión, el CMS ya dijo quién es en esta misma
  // página. Pedírselo por formulario era pedirle dos veces lo mismo (#17).
  // Siguen siendo editables — quien compra para otra persona cambia el nombre.
  /** Hay sesión en el host. La cuenta lo dice en vez de pedir los datos a ciegas. */
  // ─── Confirmación de compra (SH-11) ─────────────────────────────────────────
  readonly confirmationConfig = computed<ConfirmationShellConfig>(() => ({
    heading: 'Compra confirmada',
    summary: 'Te enviamos el detalle por correo.',
    referenceLabel: 'Número de pedido',
    stepsLabel: 'Qué sigue',
    copyLabel: 'Copiar número',
    copiedLabel: 'Número copiado',
  }));

  readonly confirmationSteps: readonly ConfirmationStep[] = [
    { id: 'pagado', label: 'Pago recibido', done: true },
    { id: 'alistando', label: 'Preparamos tu pedido', detail: 'Te avisamos cuando salga.' },
    { id: 'envio', label: 'Envío', detail: 'Puedes seguirlo desde «Mis compras».' },
  ];

  readonly confirmationActions: readonly ConfirmationAction[] = [
    { id: 'compras', label: 'Ver mis compras', kind: 'primary' },
    { id: 'seguir', label: 'Seguir comprando' },
  ];

  onConfirmationAction(id: string): void {
    if (id === 'compras') {
      this.navegacion.goToAccount();
      return;
    }
    this.pagina.startOver();
  }
}
