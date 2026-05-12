import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let inputId = 0;

@Component({
  selector: 'syn-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-input" [class.syn-input--error]="invalid()">
      @if (label()) {
        <label class="syn-input__label" [attr.for]="fieldId()">{{ label() }}</label>
      }

      <input
        class="syn-input__field"
        [id]="fieldId()"
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [required]="required()"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-label]="ariaLabel() || label() || placeholder() || 'Input field'"
        [attr.aria-describedby]="describedByIds() || null"
        (input)="onInput($event)"
        (blur)="blurred.emit()"
        (focus)="focused.emit()"
      />

      @if (hint()) {
        <p class="syn-input__hint" [id]="hintId()">{{ hint() }}</p>
      }
    </div>
  `,
  styleUrl: './input.scss',
})
export class InputComponent {
  readonly id = input('');
  readonly label = input('');
  readonly hint = input('');
  readonly ariaLabel = input('');
  readonly describedBy = input('');
  readonly type = input<'text' | 'email' | 'password' | 'search'>('text');
  readonly placeholder = input('');
  readonly value = input('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly required = input(false);

  readonly valueChange = output<string>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly fieldId = computed(() => this.id() || `syn-input-${inputId}`);
  readonly hintId = computed(() => `${this.fieldId()}-hint`);
  readonly describedByIds = computed(() => {
    const ids = [this.describedBy().trim(), this.hint() ? this.hintId() : ''].filter(Boolean);
    return ids.join(' ');
  });

  constructor() {
    inputId += 1;
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.valueChange.emit(target.value);
  }
}
