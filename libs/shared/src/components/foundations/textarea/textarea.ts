import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let textareaId = 0;

@Component({
  selector: 'syn-textarea',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-textarea">
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
        [attr.aria-label]="ariaLabel() || label() || placeholder() || 'Text area'"
        [attr.aria-describedby]="describedBy() || null"
        (input)="onInput($event)"
        (blur)="blurred.emit()"
        (focus)="focused.emit()"
      ></textarea>
    </div>
  `,
  styleUrl: './textarea.scss',
})
export class TextareaComponent {
  readonly id = input('');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly describedBy = input('');
  readonly placeholder = input('');
  readonly value = input('');
  readonly rows = input(4);
  readonly disabled = input(false);
  readonly required = input(false);

  readonly valueChange = output<string>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly fieldId = computed(() => this.id() || `syn-textarea-${textareaId}`);

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