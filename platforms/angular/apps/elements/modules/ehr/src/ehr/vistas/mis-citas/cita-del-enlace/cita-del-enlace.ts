import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CitaLeida } from '@synergos/dominio/salud';
import { ButtonComponent, LiveRegionComponent } from '@synergos/shared';
import { t } from '@synergos/vitals-core';
import { encabezadoDeLaCita, estadoDeLaCita } from '../../../textos-de-salud';

/**
 * La cita del enlace del aviso (`?cita={id}`, T031) en «Mis citas», como vista propia (T051): lo que contestó el servidor
 * —su número, su estado, el profesional, la hora y el total— y «Cancelar cita» mientras siga pendiente. Lo que se lee del
 * directorio y de la zona del sitio lo trae la app ya escrito; la vista no adivina un profesional ni una hora.
 */
@Component({
  selector: 'sg-salud-cita-del-enlace',
  standalone: true,
  imports: [ButtonComponent, LiveRegionComponent],
  templateUrl: './cita-del-enlace.html',
  styleUrl: './cita-del-enlace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludCitaDelEnlaceComponent {
  readonly cita = input.required<CitaLeida>();
  /** El profesional por su nombre en el directorio, o vacío: no se nombra a uno que no se conoce. */
  readonly profesional = input('');
  /** El día y la hora en la zona del sitio, o vacío sin franja o sin zona. */
  readonly hora = input('');
  /** El total ya escrito, o vacío si es cero o el servidor no lo dio. */
  readonly importe = input('');
  readonly cancelando = input(false);
  /** Lo que quedó de la última acción sobre la cita. */
  readonly aviso = input('');

  readonly cancelar = output<string>();

  protected readonly encabezado = computed(() => encabezadoDeLaCita(this.cita().numero));
  protected readonly estado = computed(() => estadoDeLaCita(this.cita().estado));
  /** Sólo se cancela en línea una cita pendiente: abierta y sin confirmar. */
  protected readonly cancelable = computed(() => this.cita().estado === 'Running');
  protected readonly textoCancelar = t('Health.Appointment.Cancel', 'Cancelar cita');
}
