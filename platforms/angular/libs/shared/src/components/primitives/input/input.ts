import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
} from '../../../utils/config-input.util';

export type InputType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'number' | 'url';

/** Valid `inputmode` tokens (HTML spec). Drives the on-screen keyboard on mobile. */
export const INPUT_MODES = [
  'none',
  'text',
  'decimal',
  'numeric',
  'tel',
  'search',
  'email',
  'url',
] as const;

export type InputMode = (typeof INPUT_MODES)[number];

/**
 * `inputmode` inferred from `type` when the consumer does not pass one explicitly.
 *
 * `number` maps to `decimal`, NOT `numeric`: this product is es-CO and `type="number"`
 * is used for prices. `numeric` renders a digits-only keypad with no decimal separator,
 * so a price field would be impossible to fill. The reverse mistake is cheap (an integer
 * quantity field shows one extra separator key that the browser rejects anyway), so the
 * asymmetry decides it. Integer-only fields pass `inputMode="numeric"` explicitly.
 *
 * `text` and `password` are absent on purpose — the browser default is already correct
 * and emitting `inputmode="text"` would only add noise.
 */
const INPUT_MODE_BY_TYPE: Partial<Record<InputType, InputMode>> = {
  email: 'email',
  tel: 'tel',
  url: 'url',
  search: 'search',
  number: 'decimal',
};

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
        [attr.inputmode]="resolvedInputMode()"
        [attr.autocomplete]="resolvedAutocomplete()"
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
  readonly type = input<InputType>('text');

  /**
   * Overrides the `inputmode` inferred from `type`. Only the HTML tokens in
   * `INPUT_MODES` are honoured; anything else falls back to the inferred value.
   */
  readonly inputMode = input<string>('');

  /**
   * HTML `autocomplete` token. Omitted by default — it is NOT inferred from `type`,
   * because the type says what a field accepts, never whose data it holds. A
   * `type="email"` box may be "your email" or "invite a friend's email", and filling
   * the second with the user's own address is exactly the failure mode to avoid.
   *
   * Useful values: `name`, `given-name`, `family-name`, `email`, `tel`,
   * `organization`, `street-address`, `address-level1` (departamento),
   * `address-level2` (ciudad), `postal-code`, `country-name`,
   * `username`, `current-password`, `new-password`, `one-time-code`, `off`.
   *
   * Never label a field `cc-number`, `cc-csc`, `cc-exp` or any other payment token
   * unless it literally collects that datum.
   */
  readonly autocomplete = input<string>('');

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

  /** Explicit `inputMode` wins; otherwise infer from `type`; otherwise omit the attribute. */
  readonly resolvedInputMode = computed<InputMode | null>(
    () =>
      coerceStringEnumInput(this.inputMode(), INPUT_MODES) ??
      INPUT_MODE_BY_TYPE[this.type()] ??
      null,
  );

  readonly resolvedAutocomplete = computed<string | null>(
    () => coerceTrimmedStringInput(this.autocomplete()) ?? null,
  );

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
