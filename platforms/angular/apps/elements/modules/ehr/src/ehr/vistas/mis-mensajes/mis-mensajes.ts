import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MisMensajes, type HiloDelPaciente, type MensajeClinico } from '@synergos/dominio/salud';
import {
  BadgeComponent,
  ButtonComponent,
  LiveRegionComponent,
  SelectComponent,
  SynEmptyStateComponent,
  SynSkeletonComponent,
  TextareaComponent,
} from '@synergos/shared';
import { textosDeLaHistoria } from '../../textos-de-salud';

/** Un instante en la fecha y la hora del sitio, como lo lee el paciente. */
export function momentoDelSitio(instante: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: zona || 'UTC' }).format(new Date(instante));
  } catch {
    return instante.slice(0, 16).replace('T', ' ');
  }
}

/**
 * «Mensajes» del paciente desde la historia de producción (003-salud-cita, I7 P15): le escribe a un profesional del
 * directorio y ve cada hilo con lo que contestó el consultorio, y si espera respuesta. Lo que no se pudo leer no es «sin
 * mensajes».
 */
@Component({
  selector: 'sg-salud-mis-mensajes',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, LiveRegionComponent, SelectComponent, SynEmptyStateComponent, SynSkeletonComponent, TextareaComponent],
  templateUrl: './mis-mensajes.html',
  styleUrl: '../consultorio/consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludMisMensajesComponent {
  protected readonly mensajes = inject(MisMensajes);
  protected readonly textos = textosDeLaHistoria();

  readonly profesionales = input<readonly { readonly id: string; readonly nombre: string }[]>([]);
  readonly zona = input('');

  readonly escribir = output<{ readonly profesional: string; readonly texto: string }>();

  protected readonly opciones = computed(() => this.profesionales().map((p) => ({ value: p.id, label: p.nombre })));
  protected readonly profesional = signal('');
  protected readonly texto = signal('');

  protected de(hilo: HiloDelPaciente, m: MensajeClinico): string {
    return m.delPaciente ? this.textos.you : hilo.profesional;
  }

  protected cuando(m: MensajeClinico): string {
    return momentoDelSitio(m.fecha, this.zona());
  }

  protected enviar(): void {
    const profesional = this.profesional() || this.profesionales()[0]?.id || '';
    if (!profesional || !this.texto().trim()) {
      return;
    }
    this.escribir.emit({ profesional, texto: this.texto().trim() });
    this.texto.set('');
  }
}
