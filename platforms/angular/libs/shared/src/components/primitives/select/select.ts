import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { coerceTrimmedStringInput } from '../../../utils/config-input.util';

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
        [attr.autocomplete]="resolvedAutocomplete()"
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

  /**
   * HTML `autocomplete` token. It DOES apply to `<select>` — a control whose value is
   * chosen from a list is still an autofill target, and the address fields most often
   * built as dropdowns are exactly the ones users hate retyping: `country`,
   * `country-name`, `address-level1` (departamento), `address-level2` (ciudad).
   *
   * `inputmode` is NOT exposed here: a `<select>` accepts no typed text, so there is
   * no on-screen keyboard for it to influence.
   *
   * Never label a field with a payment token (`cc-exp-month`, ...) unless it literally
   * collects that datum.
   */
  readonly autocomplete = input<string>('');

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

  readonly resolvedAutocomplete = computed<string | null>(
    () => coerceTrimmedStringInput(this.autocomplete()) ?? null,
  );

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
