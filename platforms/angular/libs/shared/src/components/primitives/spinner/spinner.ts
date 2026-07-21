import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '../../../utils/config-input.util';
import { VisuallyHiddenComponent } from '../visually-hidden/visually-hidden';

type SpinnerSize = 'sm' | 'md' | 'lg';
type SpinnerTone = 'brand' | 'neutral' | 'inverse';

export interface SpinnerConfig {
  readonly label?: string;
  readonly size?: SpinnerSize;
  readonly tone?: SpinnerTone;
}

function sanitizeSpinnerConfig(value: Partial<SpinnerConfig>): Partial<SpinnerConfig> {
  return omitUndefinedProperties<SpinnerConfig>({
    label: coerceTrimmedStringInput(value.label),
    size: coerceStringEnumInput(value.size, ['sm', 'md', 'lg'] as const),
    tone: coerceStringEnumInput(value.tone, ['brand', 'neutral', 'inverse'] as const),
  });
}

@Component({
  selector: 'syn-spinner',
  standalone: true,
  imports: [VisuallyHiddenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="syn-spinner" [class]="spinnerClass()" aria-hidden="true"></span>
    <syn-visually-hidden>{{ label() }}</syn-visually-hidden>
  `,
  styleUrl: './spinner.scss',
  host: {
    class: 'syn-spinner-host',
    role: 'status',
    'aria-live': 'polite',
  },
})
export class SpinnerComponent {
  readonly config = input<Partial<SpinnerConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SpinnerConfig>(sanitizeSpinnerConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly sizeInput = input<SpinnerSize | undefined>(undefined, { alias: 'size' });
  readonly toneInput = input<SpinnerTone | undefined>(undefined, { alias: 'tone' });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Loading'),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'brand'),
  );

  readonly spinnerClass = computed(() =>
    classNames(
      'syn-spinner',
      `syn-spinner--${this.size()}`,
      `syn-spinner--${this.tone()}`,
    ),
  );
}
