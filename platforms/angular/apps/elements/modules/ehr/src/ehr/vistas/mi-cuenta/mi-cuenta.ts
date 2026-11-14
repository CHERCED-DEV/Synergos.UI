import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MiCuenta, type LineaDeLaCuenta } from '@synergos/dominio/salud';
import { SynEmptyStateComponent, SynSkeletonComponent } from '@synergos/shared';
import { formatearImporte } from '@synergos/vitals-core';
import { textosDeLaHistoria } from '../../textos-de-salud';
import { fechaDelSitio } from '../consultorio/recetas-del-paciente/recetas-del-paciente';

/**
 * «Estado de cuenta» del paciente (003-salud-cita, I7 P17): una línea por cita cobrada —lo cobrado, lo devuelto si la
 * canceló y lo que queda— y sus totales, con las cifras de Payments. Una cuenta que no se pudo leer no se dibuja en cero.
 */
@Component({
  selector: 'sg-salud-mi-cuenta',
  standalone: true,
  imports: [SynEmptyStateComponent, SynSkeletonComponent],
  templateUrl: './mi-cuenta.html',
  styleUrl: '../consultorio/consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludMiCuentaComponent {
  protected readonly cuenta = inject(MiCuenta);
  protected readonly textos = textosDeLaHistoria();

  readonly zona = input('');

  protected importe(valor: number, moneda: string): string {
    return formatearImporte(valor, moneda);
  }

  protected fecha(linea: LineaDeLaCuenta): string {
    return linea.inicio ? fechaDelSitio(linea.inicio, this.zona()) : '';
  }
}
