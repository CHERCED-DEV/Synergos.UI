import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import {
  ConsultaDelDia,
  RecetasDelPaciente,
  urlDeLaReceta,
  type RecetaDelPaciente,
  type RecetaEscrita,
} from '@synergos/dominio/salud';
import {
  BadgeComponent,
  ButtonComponent,
  InputComponent,
  LiveRegionComponent,
  SynSkeletonComponent,
  TextareaComponent,
} from '@synergos/shared';
import { textosDeLaHistoria, type TextosDeLasVistasDeLaHistoria } from '../../../textos-de-salud';

/** Una fecha del sitio, larga, en español. */
export function fechaDelSitio(instante: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: zona || 'UTC' }).format(new Date(instante));
  } catch {
    return instante.slice(0, 10);
  }
}

/** El estado de una receta como se lee: vigente, vencida o anulada. */
export function estadoDeLaReceta(r: RecetaDelPaciente, t: TextosDeLasVistasDeLaHistoria): string {
  return r.estado === 'revoked' ? t.revokedLabel : r.vigente ? t.active : t.expired;
}

/**
 * Las recetas del paciente que se atiende (003-salud-cita, I5 P13 y P14): el médico emite la receta, que sale firmada;
 * la anula; y aprueba o rechaza las renovaciones que pidió el paciente. Pinta `RecetasDelPaciente` y avisa la intención.
 */
@Component({
  selector: 'sg-salud-recetas-del-paciente',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, InputComponent, LiveRegionComponent, SynSkeletonComponent, TextareaComponent],
  templateUrl: './recetas-del-paciente.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludRecetasDelPacienteComponent {
  protected readonly consulta = inject(ConsultaDelDia);
  protected readonly recetas = inject(RecetasDelPaciente);
  protected readonly textos = textosDeLaHistoria();

  readonly base = input('');
  readonly zona = input('');

  readonly emitir = output<RecetaEscrita>();
  readonly anular = output<string>();
  readonly resolver = output<{ readonly id: string; readonly aprobar: boolean }>();

  protected readonly medicamento = signal('');
  protected readonly dosis = signal('');
  protected readonly frecuencia = signal('');
  protected readonly indicaciones = signal('');
  protected readonly dias = signal('30');

  protected estado(r: RecetaDelPaciente): string {
    return estadoDeLaReceta(r, this.textos);
  }

  protected hasta(r: RecetaDelPaciente): string {
    return this.textos.validUntil(fechaDelSitio(r.hastaUtc, this.zona()));
  }

  protected pdf(id: string, patientKey: string): string {
    return urlDeLaReceta(this.base(), id, patientKey);
  }

  protected nombreDe(recetaId: string): string {
    return this.recetas.recetas().find((r) => r.id === recetaId)?.medicamento ?? '';
  }

  protected emitirLaReceta(): void {
    const dias = Number.parseInt(this.dias(), 10);
    this.emitir.emit({
      medicamento: this.medicamento().trim(),
      dosis: this.dosis().trim(),
      frecuencia: this.frecuencia().trim(),
      indicaciones: this.indicaciones().trim() || undefined,
      dias: Number.isFinite(dias) ? dias : undefined,
    });
  }
}
