import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { ConsultaDelDia, type NotaDeLaConsulta, type NotaEscrita } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, LiveRegionComponent, SynSkeletonComponent, TextareaComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../../textos-de-salud';

/** Lo más largo de cada parte de la nota (`NotaClinica.LargoMaximo` del CMS). */
const LARGO = 4000;

/**
 * Las notas de la consulta de un paciente (003-salud-cita, I3 P6): el médico escribe la nota SOAP, la guarda como borrador
 * y la firma; firmada no se cambia y su firma se comprueba. Sin el permiso del paciente el servidor contesta 403 y la
 * vista no muestra nada clínico. Pinta la fachada `ConsultaDelDia` y avisa la intención.
 */
@Component({
  selector: 'sg-salud-nota-de-la-consulta',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, LiveRegionComponent, SynSkeletonComponent, TextareaComponent],
  templateUrl: './nota-de-la-consulta.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludNotaDeLaConsultaComponent {
  protected readonly consulta = inject(ConsultaDelDia);
  protected readonly textos = textosDeLaHistoria();
  protected readonly largo = LARGO;

  readonly guardar = output<NotaEscrita>();
  readonly firmar = output<string>();
  readonly comprobar = output<string>();

  /** El borrador que se está escribiendo; `null` es una nota nueva. */
  protected readonly editando = signal<string | null>(null);
  protected readonly subjetivo = signal('');
  protected readonly objetivo = signal('');
  protected readonly analisis = signal('');
  protected readonly plan = signal('');

  /** Si lo que se edita es un borrador ya guardado: entonces se puede firmar. */
  protected readonly firmable = computed(() => {
    const id = this.editando();
    return id !== null && this.consulta.notas().some((n) => n.id === id && !n.firmada);
  });

  constructor() {
    // Guardado, el formulario sigue sobre ese borrador; firmado, vuelve a una nota nueva.
    effect(() => {
      const guardada = this.consulta.guardada();
      untracked(() => this.editando.set(guardada));
    });
    effect(() => {
      const id = this.editando();
      if (id && this.consulta.notas().some((n) => n.id === id && n.firmada)) {
        untracked(() => this.limpiar());
      }
    });
  }

  protected editar(nota: NotaDeLaConsulta): void {
    this.editando.set(nota.id);
    this.subjetivo.set(nota.subjetivo);
    this.objetivo.set(nota.objetivo);
    this.analisis.set(nota.analisis);
    this.plan.set(nota.plan);
  }

  protected limpiar(): void {
    this.editando.set(null);
    this.subjetivo.set('');
    this.objetivo.set('');
    this.analisis.set('');
    this.plan.set('');
  }

  protected guardarLaNota(): void {
    this.guardar.emit({
      id: this.editando() ?? undefined,
      subjetivo: this.subjetivo(),
      objetivo: this.objetivo(),
      analisis: this.analisis(),
      plan: this.plan(),
    });
  }
}
