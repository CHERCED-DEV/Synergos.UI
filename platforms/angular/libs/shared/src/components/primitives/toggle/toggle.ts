import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type ToggleSize = 'sm' | 'md';

let toggleId = 0;

@Component({
  selector: 'syn-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="syn-toggle" [class]="toggleClass()">
      <span class="syn-toggle__copy">
        @if (label()) {
          <span class="syn-toggle__label">{{ label() }}</span>
        }

        @if (description()) {
          <span class="syn-toggle__description">{{ description() }}</span>
        }
      </span>

      <span class="syn-toggle__control">
        <input
          class="syn-toggle__native"
          [id]="fieldId()"
          type="checkbox"
          role="switch"
          [checked]="checked()"
          [disabled]="disabled()"
          [required]="required()"
          [attr.aria-label]="ariaLabel() || label() || 'Toggle'"
          [attr.aria-checked]="checked()"
          (change)="onChange($event)"
          (keydown.space)="onSpace($event)"
        />
        <span class="syn-toggle__track" aria-hidden="true">
          <span class="syn-toggle__thumb"></span>
        </span>
      </span>
    </label>
  `,
  styleUrl: './toggle.scss',
})
export class ToggleComponent {
  readonly id = input('');
  readonly label = input('');
  readonly description = input('');
  readonly ariaLabel = input('');
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly required = input(false);
  readonly size = input<ToggleSize>('md');

  readonly checkedChange = output<boolean>();

  readonly fieldId = computed(() => this.id() || `syn-toggle-${toggleId}`);
  readonly toggleClass = computed(() =>
    classNames(
      'syn-toggle',
      `syn-toggle--${this.size()}`,
      this.disabled() && 'syn-toggle--disabled',
    ),
  );

  constructor() {
    toggleId += 1;
  }

  onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.checkedChange.emit(target.checked);
  }

  onSpace(event: Event): void {
    if (this.disabled()) {
      event.preventDefault();
    }
  }
}
