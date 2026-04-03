import type { DividerElementConfig } from '@synergos/contracts';
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
  auto: 'auto',
};

function resolveSpaceToken(value: string): string {
  return spacingValues[value] ?? value;
}

@Component({
  selector: 'sg-divider',
  templateUrl: './divider.html',
  styleUrl: './divider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-divider' },
})
export class DividerComponent {
  readonly config = input<Partial<DividerElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<DividerElementConfig>,
  });
  readonly orientationInput = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly insetInput = input<string | undefined>(undefined, { alias: 'inset' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly orientation = computed(() => this.orientationInput()?.trim() || 'horizontal');
  readonly inset = computed(() => this.insetInput()?.trim() || 'none');
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly resolvedInset = computed(() => resolveSpaceToken(this.inset()));
  readonly hostClasses = computed(
    () => `sg-divider--${this.orientation()} sg-divider--${this.variant()} sg-divider--${this.theme()}`,
  );
}
