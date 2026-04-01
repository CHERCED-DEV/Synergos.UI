import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { VisuallyHiddenComponent } from '../visually-hidden/visually-hidden';

type SpinnerSize = 'sm' | 'md' | 'lg';
type SpinnerTone = 'brand' | 'neutral' | 'inverse';

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
  readonly label = input('Loading');
  readonly size = input<SpinnerSize>('md');
  readonly tone = input<SpinnerTone>('brand');

  readonly spinnerClass = computed(() =>
    classNames(
      'syn-spinner',
      `syn-spinner--${this.size()}`,
      `syn-spinner--${this.tone()}`,
    ),
  );
}
