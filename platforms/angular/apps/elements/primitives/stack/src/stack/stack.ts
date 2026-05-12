import type { StackElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeStackConfig(value: Partial<StackElementConfig>): Partial<StackElementConfig> {
  return omitUndefinedProperties<Partial<StackElementConfig>>({
    direction: coerceTrimmedStringInput(value.direction),
    gap: coerceTrimmedStringInput(value.gap),
    alignment: coerceTrimmedStringInput(value.alignment),
    justify: coerceTrimmedStringInput(value.justify),
    wrap: coerceOptionalBooleanInput(value.wrap),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-stack',
  imports: [],
  templateUrl: './stack.html',
  styleUrl: './stack.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-stack' },
})
export class StackComponent {
  readonly config = input<Partial<StackElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<StackElementConfig>>(sanitizeStackConfig),
  });
  readonly directionInput = input<string | undefined>(undefined, { alias: 'direction' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly justifyInput = input<string | undefined>(undefined, { alias: 'justify' });
  readonly wrapInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'wrap',
    transform: coerceOptionalBooleanInput,
  });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly direction = computed(() => resolveConfigValue(this.directionInput()?.trim(), this.config()?.direction, 'column'));
  readonly gap = computed(() => resolveConfigValue(this.gapInput()?.trim(), this.config()?.gap, 'md'));
  readonly alignment = computed(() => resolveConfigValue(this.alignmentInput()?.trim(), this.config()?.alignment, 'stretch'));
  readonly justify = computed(() => resolveConfigValue(this.justifyInput()?.trim(), this.config()?.justify, 'start'));
  readonly wrap = computed(() => resolveConfigValue(this.wrapInput(), this.config()?.wrap, false));
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly hostClasses = computed(() =>
    `sg-stack--${this.variant()} sg-stack--${this.direction()} sg-stack--gap-${this.gap()} sg-stack--align-${this.alignment()} sg-stack--justify-${this.justify()}${this.wrap() ? ' sg-stack--wrap' : ''} sg-stack--${this.theme()}`,
  );
}
