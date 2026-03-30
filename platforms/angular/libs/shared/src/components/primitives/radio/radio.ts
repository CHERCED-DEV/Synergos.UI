import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let radioId = 0;

@Component({
  selector: 'syn-radio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="syn-radio" [attr.for]="fieldId()">
      <input
        class="syn-radio__native"
        [id]="fieldId()"
        type="radio"
        [name]="name()"
        [value]="value()"
        [checked]="checked()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel() || label() || 'Radio option'"
        [attr.aria-checked]="checked()"
        (change)="onChange($event)"
      />
      <span class="syn-radio__dot" aria-hidden="true"></span>
      @if (label()) {
        <span class="syn-radio__label">{{ label() }}</span>
      }
    </label>
  `,
  styleUrl: './radio.scss',
})
export class RadioComponent {
  readonly id = input('');
  readonly name = input('syn-radio-group');
  readonly value = input('');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly checked = input(false);
  readonly disabled = input(false);

  readonly checkedChange = output<boolean>();
  readonly selected = output<string>();

  readonly fieldId = computed(() => this.id() || `syn-radio-${radioId}`);

  constructor() {
    radioId += 1;
  }

  onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.checkedChange.emit(target.checked);
    if (target.checked) {
      this.selected.emit(target.value);
    }
  }
}