import type { SpacerElementConfig } from '@synergos/contracts';
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

function sanitizeSpacerConfig(value: Partial<SpacerElementConfig>): Partial<SpacerElementConfig> {
  return omitUndefinedProperties<Partial<SpacerElementConfig>>({
    size: coerceTrimmedStringInput(value.size),
    axis: coerceTrimmedStringInput(value.axis),
  });
}

@Component({
  selector: 'sg-spacer',
  templateUrl: './spacer.html',
  styleUrl: './spacer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-spacer' },
})
export class SpacerComponent {
  readonly config = input<Partial<SpacerElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<SpacerElementConfig>>(sanitizeSpacerConfig),
  });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly axisInput = input<string | undefined>(undefined, { alias: 'axis' });

  readonly size = computed(() => resolveConfigValue(this.sizeInput()?.trim(), this.config()?.size, 'md'));
  readonly axis = computed(() => resolveConfigValue(this.axisInput()?.trim(), this.config()?.axis, 'vertical'));

  readonly resolvedSize = computed(() => resolveSpaceToken(this.size()));
  readonly resolvedWidth = computed(() =>
    this.axis() === 'horizontal' ? this.resolvedSize() : '1px',
  );
  readonly resolvedHeight = computed(() =>
    this.axis() === 'horizontal' ? '1px' : this.resolvedSize(),
  );
  readonly hostClasses = computed(() => `sg-spacer--${this.axis()}`);
}
