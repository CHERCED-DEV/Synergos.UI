import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

let selectId = 0;

@Component({
  selector: 'syn-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-select" [class.syn-select--error]="invalid()">
      @if (label()) {
        <label class="syn-select__label" [attr.for]="fieldId()">{{ label() }}</label>
      }

      <select
        class="syn-select__field"
        [id]="fieldId()"
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-label]="ariaLabel() || label() || 'Select option'"
        [attr.aria-describedby]="describedByIds() || null"
        (change)="onChange($event)"
      >
        @for (option of options(); track option.value) {
          <option [value]="option.value" [disabled]="option.disabled ?? false">
            {{ option.label }}
          </option>
        }
      </select>

      @if (hint()) {
        <p class="syn-select__hint" [id]="hintId()">{{ hint() }}</p>
      }
    </div>
  `,
  styleUrl: './select.scss',
})
export class SelectComponent {
  readonly id = input('');
  readonly label = input('');
  readonly hint = input('');
  readonly ariaLabel = input('');
  readonly describedBy = input('');
  readonly value = input('');
  readonly options = input<readonly SelectOption[]>([]);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly required = input(false);

  readonly valueChange = output<string>();

  readonly fieldId = computed(() => this.id() || `syn-select-${selectId}`);
  readonly hintId = computed(() => `${this.fieldId()}-hint`);
  readonly describedByIds = computed(() => {
    const ids = [this.describedBy().trim(), this.hint() ? this.hintId() : ''].filter(Boolean);
    return ids.join(' ');
  });

  constructor() {
    selectId += 1;
  }

  onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    this.valueChange.emit(target.value);
  }
}
