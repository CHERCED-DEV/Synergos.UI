import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  GridColumnsComponent,
  type GridColumnsGap,
  coerceConfigInput,
  coerceOptionalNumberInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface GridConfig {
  readonly columns?: number;
  readonly gap?: string;
  readonly minColumnWidth?: string;
  readonly theme?: string;
}

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
  readonly configInput = input<Partial<GridConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<GridConfig>,
  });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly minColumnWidthInput = input<string | undefined>(undefined, { alias: 'minColumnWidth' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly columns = computed(() =>
    resolveConfigValue(this.columnsInput(), this.configInput()?.columns, 3),
  );
  readonly gap = computed(() =>
    resolveConfigValue(this.gapInput(), this.configInput()?.gap, 'md'),
  );
  readonly minColumnWidth = computed(() =>
    resolveConfigValue(this.minColumnWidthInput(), this.configInput()?.minColumnWidth, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

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
