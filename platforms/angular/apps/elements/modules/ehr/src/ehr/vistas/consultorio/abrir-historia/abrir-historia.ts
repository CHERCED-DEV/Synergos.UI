import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { HistoriaEnElConsultorio } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, InputComponent, LiveRegionComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../../textos-de-salud';

/**
 * Recepción encuentra la historia de un miembro por su correo y, si no tiene, se la abre con lo demográfico (I2 T056,
 * T063). Ve si el paciente ya hizo su pre-registro; nada clínico. El estado es de `HistoriaEnElConsultorio`; la vista
 * avisa la intención y la app la encadena.
 */
@Component({
  selector: 'sg-salud-abrir-historia',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, InputComponent, LiveRegionComponent],
  templateUrl: './abrir-historia.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludAbrirHistoriaComponent {
  protected readonly consultorio = inject(HistoriaEnElConsultorio);
  protected readonly textos = textosDeLaHistoria();

  readonly buscar = output<string>();
  readonly abrir = output<{ readonly nombre: string; readonly fechaDeNacimiento: string }>();
  readonly verResumen = output<void>();

  protected readonly correo = signal('');
  protected readonly nombre = signal('');
  protected readonly fechaDeNacimiento = signal('');
}
