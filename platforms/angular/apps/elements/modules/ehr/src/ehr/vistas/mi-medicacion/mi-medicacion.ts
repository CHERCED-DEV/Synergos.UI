import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MiMedicacion, urlDeLaReceta, type RecetaDelPaciente } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, LiveRegionComponent, SynEmptyStateComponent, SynSkeletonComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../textos-de-salud';
import { estadoDeLaReceta, fechaDelSitio } from '../consultorio/recetas-del-paciente/recetas-del-paciente';

/**
 * «Medicamentos» del paciente desde la historia de producción (003-salud-cita, I5 P14): lo que toma hoy —las recetas
 * vigentes, con su PDF— y pedir renovarlas; las anteriores aparte. Lo que no se pudo leer no es «sin medicamentos».
 */
@Component({
  selector: 'sg-salud-mi-medicacion',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, LiveRegionComponent, SynEmptyStateComponent, SynSkeletonComponent],
  templateUrl: './mi-medicacion.html',
  styleUrl: '../consultorio/consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludMiMedicacionComponent {
  protected readonly medicacion = inject(MiMedicacion);
  protected readonly textos = textosDeLaHistoria();

  readonly base = input('');
  readonly zona = input('');

  readonly pedir = output<string>();

  protected estado(r: RecetaDelPaciente): string {
    return estadoDeLaReceta(r, this.textos);
  }

  protected hasta(r: RecetaDelPaciente): string {
    return this.textos.validUntil(fechaDelSitio(r.hastaUtc, this.zona()));
  }

  protected pdf(id: string): string {
    return urlDeLaReceta(this.base(), id, null);
  }

  /** En qué va la renovación de la receta, o `null` si nunca se pidió. */
  protected renovacion(recetaId: string): string | null {
    const r = this.medicacion.renovacionDe(recetaId);
    if (!r) {
      return null;
    }
    return r.estado === 'aprobada'
      ? this.textos.renewalStateApproved
      : r.estado === 'rechazada'
        ? this.textos.renewalStateRejected
        : this.textos.renewalStateRequested;
  }
}
