import type { GridElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  GridColumnsComponent,
  type GridColumnsGap,
  coerceConfigInput,
  coerceOptionalNumberInput,
  resolveConfigValue,
} from '@synergos/shared';

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
  readonly config = input<Partial<GridElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<GridElementConfig>,
  });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly minColumnWidthInput = input<string | undefined>(undefined, { alias: 'minColumnWidth' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly columns = computed(() => this.columnsInput() ?? 3);
  readonly gap = computed(() => this.gapInput()?.trim() || 'md');
  readonly minColumnWidth = computed(() => this.minColumnWidthInput()?.trim() || '');
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly resolvedColumns = computed(() =>
    this.columns() > 0 ? this.columns() : 3,
  );
  readonly resolvedGap = computed<GridColumnsGap>(() => resolveGridGap(this.gap()));
  readonly resolvedMinColumnWidth = computed(() =>
    this.minColumnWidth().trim() || '16rem',
  );
  readonly autoFit = computed(() => this.minColumnWidth().trim().length > 0);
  readonly hostClasses = computed(() => `sg-grid--${this.variant()} sg-grid--${this.theme()}`);
}
