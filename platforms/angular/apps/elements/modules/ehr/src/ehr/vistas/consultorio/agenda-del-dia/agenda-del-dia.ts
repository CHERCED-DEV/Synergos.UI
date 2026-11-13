import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ConsultaDelDia, siguientePaso, type CitaDelDia, type LlegadaDeLaCita, type PasoDeLlegada } from '@synergos/dominio/salud';
import {
  BadgeComponent,
  ButtonComponent,
  InputComponent,
  LiveRegionComponent,
  SelectComponent,
  SynSkeletonComponent,
} from '@synergos/shared';
import { textosDeLaHistoria } from '../../../textos-de-salud';

/** El día de hoy en la zona del sitio, como `aaaa-mm-dd`. */
export function hoyEn(zona: string, ahora = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  } catch {
    return ahora.toISOString().slice(0, 10);
  }
}

/**
 * La agenda del día del consultorio (003-salud-cita, I3 P9 y P10): las citas de un profesional desde Booking, con el
 * nombre de la historia y en qué va su llegada. Recepción marca llegó, en sala o no vino; el médico, atendido, y abre las
 * notas. Quién puede cada cosa lo decide el servidor. La vista pinta la fachada `ConsultaDelDia` y avisa la intención.
 */
@Component({
  selector: 'sg-salud-agenda-del-dia',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, InputComponent, LiveRegionComponent, SelectComponent, SynSkeletonComponent],
  templateUrl: './agenda-del-dia.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludAgendaDelDiaComponent {
  protected readonly consulta = inject(ConsultaDelDia);
  protected readonly textos = textosDeLaHistoria();

  readonly profesionales = input<readonly { readonly id: string; readonly nombre: string }[]>([]);
  readonly zona = input('');

  readonly ver = output<{ readonly profesional: string; readonly dia: string }>();
  readonly marcar = output<{ readonly reservaId: string; readonly paso: PasoDeLlegada }>();
  readonly abrirNotas = output<CitaDelDia>();

  protected readonly profesional = signal('');
  protected readonly dia = signal(hoyEn(''));
  protected readonly opciones = computed(() => this.profesionales().map((p) => ({ value: p.id, label: p.nombre })));

  protected readonly siguiente = siguientePaso;

  protected hora(instante: string): string {
    try {
      return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: this.zona() || 'UTC' })
        .format(new Date(instante));
    } catch {
      return instante;
    }
  }

  protected estado(llegada: LlegadaDeLaCita): string {
    switch (llegada) {
      case 'llego':
        return this.textos.stateArrived;
      case 'en-sala':
        return this.textos.stateInRoom;
      case 'atendido':
        return this.textos.stateSeen;
      case 'no-vino':
        return this.textos.stateNoShow;
      default:
        return this.textos.stateBooked;
    }
  }

  protected accion(paso: PasoDeLlegada): string {
    return paso === 'llegar' ? this.textos.stepArrive : paso === 'pasar' ? this.textos.stepRoom : this.textos.stepAttend;
  }

  protected verLaAgenda(): void {
    const profesional = this.profesional() || this.profesionales()[0]?.id || '';
    this.profesional.set(profesional);
    this.ver.emit({ profesional, dia: this.dia().trim() || hoyEn(this.zona()) });
  }
}
