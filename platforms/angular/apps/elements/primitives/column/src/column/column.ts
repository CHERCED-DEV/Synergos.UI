import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

const spacingValues: Record<string, string> = {
  none: '0',
  '2xs': '0.125rem',
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  '3xl': '4rem',
};

function resolveSpaceToken(value: string): string {
  return spacingValues[value] ?? value;
}

export interface ColumnConfig {
  readonly width?: string;
  readonly minWidth?: string;
  readonly alignment?: string;
  readonly padding?: string;
  readonly gap?: string;
  readonly theme?: string;
}

@Component({
  selector: 'sg-column',
  templateUrl: './column.html',
  styleUrl: './column.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-column' },
})
export class ColumnComponent {
  readonly configInput = input<Partial<ColumnConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ColumnConfig>,
  });
  readonly widthInput = input<string | undefined>(undefined, { alias: 'width' });
  readonly minWidthInput = input<string | undefined>(undefined, { alias: 'minWidth' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly paddingInput = input<string | undefined>(undefined, { alias: 'padding' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly width = computed(() =>
    resolveConfigValue(this.widthInput(), this.configInput()?.width, ''),
  );
  readonly minWidth = computed(() =>
    resolveConfigValue(this.minWidthInput(), this.configInput()?.minWidth, ''),
  );
  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), this.configInput()?.alignment, 'stretch'),
  );
  readonly padding = computed(() =>
    resolveConfigValue(this.paddingInput(), this.configInput()?.padding, 'md'),
  );
  readonly gap = computed(() =>
    resolveConfigValue(this.gapInput(), this.configInput()?.gap, 'md'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly resolvedPadding = computed(() => resolveSpaceToken(this.padding()));
  readonly resolvedGap = computed(() => resolveSpaceToken(this.gap()));
  readonly hostClasses = computed(() => `sg-column--${this.theme()}`);
}
