import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { coerceTrimmedStringInput } from '../../../utils/config-input.util';

let textareaId = 0;

@Component({
  selector: 'syn-textarea',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-textarea" [class.syn-textarea--error]="invalid()">
      @if (label()) {
        <label class="syn-textarea__label" [attr.for]="fieldId()">{{ label() }}</label>
      }

      <textarea
        class="syn-textarea__field"
        [id]="fieldId()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [required]="required()"
        [value]="value()"
        [attr.autocomplete]="resolvedAutocomplete()"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-label]="ariaLabel() || label() || placeholder() || 'Text area'"
        [attr.aria-describedby]="describedByIds() || null"
        (input)="onInput($event)"
        (blur)="blurred.emit()"
        (focus)="focused.emit()"
      ></textarea>

      @if (hint()) {
        <p class="syn-textarea__hint" [id]="hintId()">{{ hint() }}</p>
      }
    </div>
  `,
  styleUrl: './textarea.scss',
})
export class TextareaComponent {
  readonly id = input('');
  readonly label = input('');
  readonly hint = input('');
  readonly ariaLabel = input('');
  readonly describedBy = input('');
  readonly placeholder = input('');
  readonly value = input('');

  /**
   * HTML `autocomplete` token. Applies to `<textarea>` and is omitted by default.
   * The realistic values here are the multiline ones — `street-address` — plus `off`
   * for free-text boxes (comments, notes, message bodies) that must never be autofilled.
   *
   * `inputmode` is deliberately NOT exposed: a textarea has no `type` to infer from and
   * its content is prose, for which the default keyboard is already correct.
   *
   * Never label a field with a payment token (`cc-number`, `cc-csc`, ...) unless it
   * literally collects that datum.
   */
  readonly autocomplete = input<string>('');

  readonly rows = input(4);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly required = input(false);

  readonly valueChange = output<string>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly fieldId = computed(() => this.id() || `syn-textarea-${textareaId}`);
  readonly hintId = computed(() => `${this.fieldId()}-hint`);
  readonly describedByIds = computed(() => {
    const ids = [this.describedBy().trim(), this.hint() ? this.hintId() : ''].filter(Boolean);
    return ids.join(' ');
  });

  readonly resolvedAutocomplete = computed<string | null>(
    () => coerceTrimmedStringInput(this.autocomplete()) ?? null,
  );

  constructor() {
    textareaId += 1;
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    this.valueChange.emit(target.value);
  }
}
