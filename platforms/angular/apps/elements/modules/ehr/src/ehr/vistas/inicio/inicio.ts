import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  MiCuenta,
  MisMensajes,
  MisResultados,
  estadoDeLosMensajes,
  resultadosLiberados,
} from '@synergos/dominio/salud';
import { ButtonComponent, SynSkeletonComponent } from '@synergos/shared';
import { formatearImporte } from '@synergos/vitals-core';
import { textosDeLaHistoria } from '../../textos-de-salud';

/** Las vistas del portal a las que lleva una tarjeta del inicio. */
export type DestinoDelInicio = 'visits' | 'schedule' | 'results' | 'messages' | 'billing';

/**
 * El inicio del paciente desde la historia de producción (003-salud-cita, I8 P19): la próxima cita, los resultados
 * liberados, las conversaciones con el consultorio y lo pagado, todo de las mismas lecturas que sus vistas. Una tarjeta cuya
 * lectura falló lo dice: no se pinta un cero.
 */
@Component({
  selector: 'sg-salud-inicio',
  standalone: true,
  imports: [ButtonComponent, SynSkeletonComponent],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludInicioComponent {
  protected readonly resultados = inject(MisResultados);
  protected readonly mensajes = inject(MisMensajes);
  protected readonly cuenta = inject(MiCuenta);
  protected readonly textos = textosDeLaHistoria();

  /** La próxima cita ya escrita (día, hora y profesional), vacía si no hay; `null` si las citas no se pudieron leer. */
  readonly proxima = input<string | null>('');
  /** Mientras se leen las citas. */
  readonly cargandoCitas = input(false);

  readonly ir = output<DestinoDelInicio>();

  protected readonly liberados = computed(() => resultadosLiberados(this.resultados.ordenes()));
  protected readonly conversaciones = computed(() => estadoDeLosMensajes(this.mensajes.hilos()));
  protected readonly pagado = computed(() =>
    this.cuenta.cuenta().totales.map((t) => formatearImporte(t.neto, t.moneda)).join(' · '),
  );
}
