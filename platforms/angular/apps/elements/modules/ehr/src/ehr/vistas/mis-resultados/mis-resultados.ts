import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MisResultados, urlDelInforme } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../textos-de-salud';
import { nombreDeLaMarca, nombreDelTipo } from '../consultorio/ordenes-del-paciente/ordenes-del-paciente';

/**
 * «Resultados» del paciente desde la historia de producción (003-salud-cita, I4 P12): sus órdenes y los resultados que el
 * médico ya liberó, con el rango y el informe para descargar. Lo que no se pudo leer no es «sin resultados».
 */
@Component({
  selector: 'sg-salud-mis-resultados',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent],
  templateUrl: './mis-resultados.html',
  styleUrl: '../consultorio/consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludMisResultadosComponent {
  protected readonly resultados = inject(MisResultados);
  protected readonly textos = textosDeLaHistoria();

  readonly base = input('');

  protected tipo(tipo: string): string {
    return nombreDelTipo(tipo, this.textos);
  }

  protected marca(marca: string): string {
    return nombreDeLaMarca(marca, this.textos);
  }

  protected informe(resultadoId: string): string {
    return urlDelInforme(this.base(), resultadoId, null);
  }
}
