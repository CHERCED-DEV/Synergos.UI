import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CancelacionLeida, DevolucionPrevista, PoliticaDeDevolucion } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, LiveRegionComponent } from '@synergos/shared';
import { formatearImporte } from '@synergos/vitals-core';
import { textosDeLaCancelacion } from '../../../textos-de-salud';

/**
 * «Cancelar cita» sobre una cita YA confirmada, en «Mis citas» (003-salud-cita, I6, la ficha F4): antes de cancelar dice
 * cuánto se devolvería ahora con la política del sitio, y pide confirmarlo; ya cancelada, dice cuánto se devolvió. Lo
 * previsto lo calcula la app con la misma regla que el orquestador; lo devuelto es lo que contestó el servidor.
 */
@Component({
  selector: 'sg-salud-cancelar-cita',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, LiveRegionComponent],
  templateUrl: './cancelar-cita.html',
  styleUrl: './cancelar-cita.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludCancelarCitaComponent {
  readonly citaId = input.required<string>();
  readonly prevista = input.required<DevolucionPrevista>();
  readonly politica = input.required<PoliticaDeDevolucion>();
  /** Si la cita tiene copago: sin él, cancelar no cobra nada. */
  readonly conCopago = input(false);
  /** La cancelación de esta cita, si ya se canceló. */
  readonly cancelada = input<CancelacionLeida | null>(null);
  readonly moviendo = input(false);
  /** Lo que quedó de cancelarla, o vacío. */
  readonly aviso = input('');

  readonly cancelar = output<string>();

  protected readonly textos = textosDeLaCancelacion();
  protected readonly confirmando = signal(false);

  /** Lo que se devolvería si se cancela ahora, ya dicho. */
  protected readonly loQueSeDevuelve = computed(() => {
    const p = this.prevista();
    if (!this.conCopago()) return this.textos.noCopay;
    if (!p.monto) return this.textos.refundNone;
    const monto = formatearImporte(p.monto.amount, p.monto.currency);
    return p.tramo === 'total' ? this.textos.refundAll(monto) : this.textos.refundPart(this.politica().porcentaje, monto);
  });

  protected readonly regla = computed(() => {
    const p = this.politica();
    return this.textos.policy(p.totalHoras, p.parcialHoras, p.porcentaje);
  });

  protected readonly devuelto = computed(() => {
    const d = this.cancelada()?.devuelto;
    return d ? this.textos.refunded(formatearImporte(d.amount, d.currency)) : this.textos.noRefund;
  });

  protected confirmar(): void {
    this.confirmando.set(false);
    this.cancelar.emit(this.citaId());
  }
}
