import type { GridElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  GridColumnsComponent,
  type GridColumnsGap,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function resolveGridGap(value: string): GridColumnsGap {
  return value === 'sm' || value === 'lg' ? value : 'md';
}

function sanitizeGridConfig(value: Partial<GridElementConfig>): Partial<GridElementConfig> {
  return omitUndefinedProperties<Partial<GridElementConfig>>({
    columns: coerceOptionalNumberInput(value.columns),
    gap: coerceTrimmedStringInput(value.gap),
    minColumnWidth: coerceTrimmedStringInput(value.minColumnWidth),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
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
    transform: createConfigInputTransform<Partial<GridElementConfig>>(sanitizeGridConfig),
  });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly minColumnWidthInput = input<string | undefined>(undefined, { alias: 'minColumnWidth' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly columns = computed(() => resolveConfigValue(this.columnsInput(), this.config()?.columns, 3));
  readonly gap = computed(() => resolveConfigValue(this.gapInput()?.trim(), this.config()?.gap, 'md'));
  readonly minColumnWidth = computed(() => resolveConfigValue(this.minColumnWidthInput()?.trim(), this.config()?.minColumnWidth, ''));
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
