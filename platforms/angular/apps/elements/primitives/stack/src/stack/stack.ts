import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface StackConfig {
  readonly direction?: string;
  readonly gap?: string;
  readonly alignment?: string;
  readonly justify?: string;
  readonly wrap?: boolean;
  readonly theme?: string;
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
  readonly configInput = input<Partial<StackConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<StackConfig>,
  });
  readonly directionInput = input<string | undefined>(undefined, { alias: 'direction' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly justifyInput = input<string | undefined>(undefined, { alias: 'justify' });
  readonly wrapInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'wrap',
    transform: coerceOptionalBooleanInput,
  });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly direction = computed(() =>
    resolveConfigValue(this.directionInput(), this.configInput()?.direction, 'column'),
  );
  readonly gap = computed(() =>
    resolveConfigValue(this.gapInput(), this.configInput()?.gap, 'md'),
  );
  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), this.configInput()?.alignment, 'stretch'),
  );
  readonly justify = computed(() =>
    resolveConfigValue(this.justifyInput(), this.configInput()?.justify, 'start'),
  );
  readonly wrap = computed(() =>
    resolveConfigValue(this.wrapInput(), this.configInput()?.wrap, false),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hostClasses = computed(() =>
    `sg-stack--${this.direction()} sg-stack--gap-${this.gap()} sg-stack--align-${this.alignment()} sg-stack--justify-${this.justify()}${this.wrap() ? ' sg-stack--wrap' : ''} sg-stack--${this.theme()}`,
  );
}
