import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { BandejaDeLaConsulta, type ItemDeLaBandeja } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, LiveRegionComponent, SynEmptyStateComponent, SynSkeletonComponent, TextareaComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../../textos-de-salud';
import { momentoDelSitio } from '../../mis-mensajes/mis-mensajes';

/**
 * La bandeja del consultorio (003-salud-cita, I7 P16): en un solo sitio, los resultados por liberar, las renovaciones
 * pedidas y los mensajes sin responder. Un resultado o una renovación abren al paciente en la agenda, donde se atienden; un
 * mensaje se contesta aquí. Lo atendido sale de la bandeja.
 */
@Component({
  selector: 'sg-salud-bandeja',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, LiveRegionComponent, SynEmptyStateComponent, SynSkeletonComponent, TextareaComponent],
  templateUrl: './bandeja.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludBandejaComponent {
  protected readonly bandeja = inject(BandejaDeLaConsulta);
  protected readonly textos = textosDeLaHistoria();

  readonly zona = input('');

  readonly actualizar = output<void>();
  readonly abrirPaciente = output<ItemDeLaBandeja>();
  readonly abrirHilo = output<string>();
  readonly responder = output<string>();

  protected readonly respuesta = signal('');

  protected tipo(item: ItemDeLaBandeja): string {
    return item.tipo === 'resultado' ? this.textos.kindResult : item.tipo === 'renovacion' ? this.textos.kindRenewal : this.textos.kindMessage;
  }

  protected cuando(instante: string): string {
    return momentoDelSitio(instante, this.zona());
  }

  protected enviar(): void {
    if (!this.respuesta().trim()) {
      return;
    }
    this.responder.emit(this.respuesta().trim());
    this.respuesta.set('');
  }
}
