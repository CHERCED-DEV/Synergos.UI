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

export interface SpacerConfig {
  readonly size?: string;
  readonly axis?: string;
}

@Component({
  selector: 'sg-spacer',
  templateUrl: './spacer.html',
  styleUrl: './spacer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-spacer' },
})
export class SpacerComponent {
  readonly configInput = input<Partial<SpacerConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<SpacerConfig>,
  });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly axisInput = input<string | undefined>(undefined, { alias: 'axis' });

  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.configInput()?.size, 'md'),
  );
  readonly axis = computed(() =>
    resolveConfigValue(this.axisInput(), this.configInput()?.axis, 'vertical'),
  );

  readonly resolvedSize = computed(() => resolveSpaceToken(this.size()));
  readonly resolvedWidth = computed(() =>
    this.axis() === 'horizontal' ? this.resolvedSize() : '1px',
  );
  readonly resolvedHeight = computed(() =>
    this.axis() === 'horizontal' ? '1px' : this.resolvedSize(),
  );
  readonly hostClasses = computed(() => `sg-spacer--${this.axis()}`);
}
