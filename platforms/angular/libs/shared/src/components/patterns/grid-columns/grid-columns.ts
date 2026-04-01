import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type GridColumnsGap = 'sm' | 'md' | 'lg';

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

  readonly gridClass = computed(() =>
    classNames(
      'syn-grid-columns',
      `syn-grid-columns--gap-${this.gap()}`,
      this.autoFit() ? 'syn-grid-columns--auto-fit' : 'syn-grid-columns--fixed',
    ),
  );
}
