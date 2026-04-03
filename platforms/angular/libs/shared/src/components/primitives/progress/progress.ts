import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { coerceConfigInput, resolveConfigValue } from '../../../utils/config-input.util';

type ProgressSize = 'sm' | 'md' | 'lg';
type ProgressVariant = 'brand' | 'success' | 'warning' | 'critical';

export interface ProgressConfig {
  readonly value?: number;
  readonly max?: number;
  readonly size?: ProgressSize;
  readonly variant?: ProgressVariant;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly showLabel?: boolean;
  readonly indeterminate?: boolean;
}

@Component({
  selector: 'syn-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="syn-progress"
      [class]="progressClass()"
      role="progressbar"
      [attr.aria-label]="ariaLabel() || displayLabel()"
      [attr.aria-valuemin]="indeterminate() ? null : 0"
      [attr.aria-valuemax]="indeterminate() ? null : safeMax()"
      [attr.aria-valuenow]="indeterminate() ? null : normalizedValue()"
    >
      <span
        class="syn-progress__bar"
        [style.width.%]="indeterminate() ? null : percentage()"
      ></span>
    </div>

    @if (showLabel()) {
      <span class="syn-progress__label">{{ displayLabel() }}</span>
    }
  `,
  styleUrl: './progress.scss',
  host: {
    class: 'syn-progress-host',
  },
})
export class ProgressComponent {
  readonly config = input<Partial<ProgressConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<ProgressConfig>,
  });
  readonly valueInput = input<number | undefined>(undefined, { alias: 'value' });
  readonly maxInput = input<number | undefined>(undefined, { alias: 'max' });
  readonly sizeInput = input<ProgressSize | undefined>(undefined, { alias: 'size' });
  readonly variantInput = input<ProgressVariant | undefined>(undefined, { alias: 'variant' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly showLabelInput = input<boolean | undefined>(undefined, { alias: 'showLabel' });
  readonly indeterminateInput = input<boolean | undefined>(undefined, {
    alias: 'indeterminate',
  });

  readonly value = computed(() =>
    resolveConfigValue(this.valueInput(), this.config()?.value, 0),
  );
  readonly max = computed(() =>
    resolveConfigValue(this.maxInput(), this.config()?.max, 100),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'brand'),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly showLabel = computed(() =>
    resolveConfigValue(this.showLabelInput(), this.config()?.showLabel, true),
  );
  readonly indeterminate = computed(() =>
    resolveConfigValue(this.indeterminateInput(), this.config()?.indeterminate, false),
  );

  readonly safeMax = computed(() => (this.max() > 0 ? this.max() : 100));
  readonly normalizedValue = computed(() => Math.min(this.safeMax(), Math.max(0, this.value())));
  readonly percentage = computed(() => (this.normalizedValue() / this.safeMax()) * 100);
  readonly displayLabel = computed(() => {
    if (this.label()) {
      return this.label();
    }

    return this.indeterminate() ? 'Loading' : `${Math.round(this.percentage())}%`;
  });

  readonly progressClass = computed(() =>
    classNames(
      'syn-progress',
      `syn-progress--${this.size()}`,
      `syn-progress--${this.variant()}`,
      this.indeterminate() && 'syn-progress--indeterminate',
    ),
  );
}
