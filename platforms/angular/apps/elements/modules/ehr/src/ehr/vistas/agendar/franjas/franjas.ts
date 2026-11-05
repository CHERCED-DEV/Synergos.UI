import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent, LiveRegionComponent } from '@synergos/shared';

/** Un día de la agenda como lo pinta el paso de la hora: su fecha, cómo se lee y sus horas libres. */
export interface DiaDeLaAgenda {
  readonly fecha: string;
  readonly etiqueta: string;
  readonly horas: readonly string[];
}

/** La hora que eligió el paciente: el día y la hora del SITIO. */
export interface HoraElegida {
  readonly date: string;
  readonly time: string;
}

/**
 * El paso de la hora del asistente (T046), como vista propia (T051): los días y sus horas libres, cada una un `syn-button`
 * con su estado (`aria-pressed`) en vez de un botón hecho a mano que sólo se pintaba distinto. Qué horas hay lo decide la
 * app —por la puerta, la agenda del profesional; por la directa, las de siempre— y la vista avisa la elegida.
 */
@Component({
  selector: 'sg-salud-franjas',
  standalone: true,
  imports: [ButtonComponent, LiveRegionComponent],
  templateUrl: './franjas.html',
  styleUrl: './franjas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludFranjasComponent {
  readonly dias = input.required<readonly DiaDeLaAgenda[]>();
  readonly elegida = input<HoraElegida | null>(null);
  /** Lo que se dice de la agenda: que no se pudo leer o que no hay horas libres. */
  readonly aviso = input<string | null>(null);

  readonly elegir = output<HoraElegida>();

  protected esLaElegida(fecha: string, hora: string): boolean {
    const elegida = this.elegida();
    return elegida !== null && elegida.date === fecha && elegida.time === hora;
  }
}
