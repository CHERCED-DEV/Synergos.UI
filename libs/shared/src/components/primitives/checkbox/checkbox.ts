import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let checkboxId = 0;

@Component({
  selector: 'syn-checkbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="syn-checkbox" [attr.for]="fieldId()">
      <input
        class="syn-checkbox__native"
        [id]="fieldId()"
        type="checkbox"
        [checked]="checked()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel() || label() || 'Checkbox'"
        [attr.aria-checked]="checked()"
        (change)="onChange($event)"
        (keydown.space)="onSpace($event)"
      />
      <span class="syn-checkbox__box" aria-hidden="true"></span>
      @if (label()) {
        <span class="syn-checkbox__label">{{ label() }}</span>
      }
    </label>
  `,
  styleUrl: './checkbox.scss',
})
export class CheckboxComponent {
  readonly id = input('');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly checked = input(false);
  readonly disabled = input(false);

  readonly checkedChange = output<boolean>();

  readonly fieldId = computed(() => this.id() || `syn-checkbox-${checkboxId}`);

  constructor() {
    checkboxId += 1;
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
