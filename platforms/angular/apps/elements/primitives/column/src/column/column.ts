import type { ColumnElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

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

function sanitizeColumnConfig(value: Partial<ColumnElementConfig>): Partial<ColumnElementConfig> {
  return omitUndefinedProperties<Partial<ColumnElementConfig>>({
    width: coerceTrimmedStringInput(value.width),
    minWidth: coerceTrimmedStringInput(value.minWidth),
    alignment: coerceTrimmedStringInput(value.alignment),
    padding: coerceTrimmedStringInput(value.padding),
    gap: coerceTrimmedStringInput(value.gap),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-column',
  templateUrl: './column.html',
  styleUrl: './column.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-column' },
})
export class ColumnComponent {
  readonly config = input<Partial<ColumnElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<ColumnElementConfig>>(sanitizeColumnConfig),
  });
  readonly widthInput = input<string | undefined>(undefined, { alias: 'width' });
  readonly minWidthInput = input<string | undefined>(undefined, { alias: 'minWidth' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly paddingInput = input<string | undefined>(undefined, { alias: 'padding' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly width = computed(() => resolveConfigValue(this.widthInput()?.trim(), this.config()?.width, ''));
  readonly minWidth = computed(() => resolveConfigValue(this.minWidthInput()?.trim(), this.config()?.minWidth, ''));
  readonly alignment = computed(() => resolveConfigValue(this.alignmentInput()?.trim(), this.config()?.alignment, 'stretch'));
  readonly padding = computed(() => resolveConfigValue(this.paddingInput()?.trim(), this.config()?.padding, 'md'));
  readonly gap = computed(() => resolveConfigValue(this.gapInput()?.trim(), this.config()?.gap, 'md'));
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly resolvedPadding = computed(() => resolveSpaceToken(this.padding()));
  readonly resolvedGap = computed(() => resolveSpaceToken(this.gap()));
  readonly hostClasses = computed(() => `sg-column--${this.variant()} sg-column--${this.theme()}`);
}
