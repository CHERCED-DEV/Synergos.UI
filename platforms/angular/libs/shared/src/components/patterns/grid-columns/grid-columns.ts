import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type GridColumnsGap = 'sm' | 'md' | 'lg';

/** Bajo qué punto de corte una rejilla de columnas fijas pasa a una sola columna (null = nunca). */
export type GridColumnsStack = 'sm' | 'md' | null;

@Component({
  selector: 'syn-grid-columns',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="syn-grid-columns"
      [class]="gridClass()"
      [style.--syn-grid-columns]="columns()"
      [style.--syn-grid-min]="minColumnWidth()"
    >
      <ng-content />
    </div>
  `,
  styleUrl: './grid-columns.scss',
})
export class GridColumnsComponent {
  readonly columns = input(2);
  readonly minColumnWidth = input('16rem');
  readonly autoFit = input(true);
  readonly gap = input<GridColumnsGap>('md');
  /**
   * Con columnas fijas, bajo este punto de corte la rejilla se apila en una columna. Apagado por defecto: quien no lo
   * pide conserva sus columnas en cualquier ancho (016, D-016-C14: tres columnas de 100 px cortaban el texto en el
   * teléfono).
   */
  readonly stackBelow = input<GridColumnsStack>(null);

  readonly gridClass = computed(() =>
    classNames(
      'syn-grid-columns',
      `syn-grid-columns--gap-${this.gap()}`,
      this.autoFit() ? 'syn-grid-columns--auto-fit' : 'syn-grid-columns--fixed',
      !this.autoFit() && this.stackBelow() ? `syn-grid-columns--stack-${this.stackBelow()}` : '',
    ),
  );
}
