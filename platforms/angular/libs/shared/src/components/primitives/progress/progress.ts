import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

type ProgressSize = 'sm' | 'md' | 'lg';
type ProgressVariant = 'brand' | 'success' | 'warning' | 'critical';

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
  readonly value = input(0);
  readonly max = input(100);
  readonly size = input<ProgressSize>('md');
  readonly variant = input<ProgressVariant>('brand');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly showLabel = input(true);
  readonly indeterminate = input(false);

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
