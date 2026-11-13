import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { HistoriaEnElConsultorio, TIPOS_DEL_RESUMEN, type DatoDelResumen } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, SynSkeletonComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../../textos-de-salud';
import { tituloDelTipo } from '../../mi-salud/mi-salud';

/**
 * El médico ve el resumen de un paciente con su permiso y valida lo que el paciente declaró (I2 T059, T063). Sin el
 * permiso, el servidor contesta 403 y la vista lo dice: no muestra nada clínico.
 */
@Component({
  selector: 'sg-salud-resumen-del-paciente',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, SynSkeletonComponent],
  templateUrl: './resumen-del-paciente.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludResumenDelPacienteComponent {
  protected readonly consultorio = inject(HistoriaEnElConsultorio);
  protected readonly tipos = TIPOS_DEL_RESUMEN;
  protected readonly textos = textosDeLaHistoria();

  readonly validar = output<string>();

  protected datosDe(tipo: string): readonly DatoDelResumen[] {
    return (this.consultorio.resumen()?.datos ?? []).filter((d) => d.tipo === tipo);
  }

  protected tituloDe(tipo: string): string {
    return tituloDelTipo(tipo, this.textos);
  }
}
