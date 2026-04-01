import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';
import { GridColumnsComponent, type GridColumnsGap } from '@synergos/shared';

function resolveGridGap(value: string): GridColumnsGap {
  return value === 'sm' || value === 'lg' ? value : 'md';
}

@Component({
  selector: 'sg-grid',
  imports: [GridColumnsComponent],
  templateUrl: './grid.html',
  styleUrl: './grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-grid' },
})
export class GridComponent {
  readonly columns = input(3, { transform: numberAttribute });
  readonly gap = input<string>('md');
  readonly minColumnWidth = input<string>('');
  readonly theme = input<string>('light');

  readonly resolvedColumns = computed(() =>
    this.columns() > 0 ? this.columns() : 3,
  );
  readonly resolvedGap = computed<GridColumnsGap>(() => resolveGridGap(this.gap()));
  readonly resolvedMinColumnWidth = computed(() =>
    this.minColumnWidth().trim() || '16rem',
  );
  readonly autoFit = computed(() => this.minColumnWidth().trim().length > 0);
  readonly hostClasses = computed(() => `sg-grid--${this.theme()}`);
}
