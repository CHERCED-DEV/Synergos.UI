import type { StackElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

@Component({
  selector: 'sg-stack',
  imports: [],
  templateUrl: './stack.html',
  styleUrl: './stack.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-stack' },
})
export class StackComponent {
  readonly configInput = input<Partial<StackElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<StackElementConfig>,
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

  readonly direction = computed(() => this.directionInput()?.trim() || 'column');
  readonly gap = computed(() => this.gapInput()?.trim() || 'md');
  readonly alignment = computed(() => this.alignmentInput()?.trim() || 'stretch');
  readonly justify = computed(() => this.justifyInput()?.trim() || 'start');
  readonly wrap = computed(() => this.wrapInput() ?? false);
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hostClasses = computed(() =>
    `sg-stack--${this.variant()} sg-stack--${this.direction()} sg-stack--gap-${this.gap()} sg-stack--align-${this.alignment()} sg-stack--justify-${this.justify()}${this.wrap() ? ' sg-stack--wrap' : ''} sg-stack--${this.theme()}`,
  );
}
