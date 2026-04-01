import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import type { FieldError } from '../../../utils/form.util';
import { ButtonComponent } from '../../primitives/button/button';
import { CheckboxComponent } from '../../primitives/checkbox/checkbox';
import { HeadingComponent } from '../../primitives/heading/heading';
import { InputComponent } from '../../primitives/input/input';
import { RadioComponent } from '../../primitives/radio/radio';
import { SelectComponent } from '../../primitives/select/select';
import { TextareaComponent } from '../../primitives/textarea/textarea';

type ConfigurableFormFieldWidth = 'full' | 'half';
type ConfigurableFormTextFieldType = 'text' | 'email' | 'password' | 'search' | 'textarea';

export interface ConfigurableFormOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface ConfigurableFormFieldBase {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly helperText?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly width?: ConfigurableFormFieldWidth;
}

export interface ConfigurableFormTextField extends ConfigurableFormFieldBase {
  readonly type: ConfigurableFormTextFieldType;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}

export interface ConfigurableFormSelectField extends ConfigurableFormFieldBase {
  readonly type: 'select';
  readonly options: readonly ConfigurableFormOption[];
  readonly initialValue?: string;
  readonly placeholderLabel?: string;
}

export interface ConfigurableFormCheckboxField extends ConfigurableFormFieldBase {
  readonly type: 'checkbox';
  readonly initialValue?: boolean;
}

export interface ConfigurableFormRadioField extends ConfigurableFormFieldBase {
  readonly type: 'radio';
  readonly options: readonly ConfigurableFormOption[];
  readonly initialValue?: string;
}

export type ConfigurableFormField =
  | ConfigurableFormCheckboxField
  | ConfigurableFormRadioField
  | ConfigurableFormSelectField
  | ConfigurableFormTextField;

export interface ConfigurableFormSection {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly fields: readonly ConfigurableFormField[];
}

export type ConfigurableFormValue = boolean | string;

export interface ConfigurableFormFieldChange {
  readonly key: string;
  readonly value: ConfigurableFormValue;
}

export interface ConfigurableFormSubmitEvent {
  readonly values: Readonly<Record<string, ConfigurableFormValue>>;
  readonly valid: boolean;
  readonly errors: readonly FieldError[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let configurableFormId = 0;

function nextFormId(): string {
  configurableFormId += 1;
  return `syn-configurable-form-${configurableFormId}`;
}

@Component({
  selector: 'syn-configurable-form',
  standalone: true,
  imports: [
    ButtonComponent,
    CheckboxComponent,
    HeadingComponent,
    InputComponent,
    RadioComponent,
    SelectComponent,
    TextareaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="syn-configurable-form" [class]="formClass()" novalidate (submit)="submit($event)">
      @if (title() || description()) {
        <header class="syn-configurable-form__header">
          <syn-heading
            [text]="title()"
            [supportingText]="description()"
            level="h3"
            size="lg"
          />
        </header>
      }

      @for (section of sections(); track trackSection(section, $index)) {
        <section class="syn-configurable-form__section">
          @if (section.title || section.description) {
            <div class="syn-configurable-form__section-header">
              @if (section.title) {
                <h4 class="syn-configurable-form__section-title">{{ section.title }}</h4>
              }

              @if (section.description) {
                <p class="syn-configurable-form__section-description">
                  {{ section.description }}
                </p>
              }
            </div>
          }

          <div class="syn-configurable-form__grid">
            @for (field of section.fields; track field.key) {
              <div class="syn-configurable-form__field" [class]="fieldClass(field)">
                @if (field.type === 'textarea') {
                  <syn-textarea
                    [id]="fieldId(field)"
                    [label]="field.label"
                    [value]="stringValue(field.key)"
                    [placeholder]="placeholder(field)"
                    [required]="field.required ?? false"
                    [disabled]="disabled() || (field.disabled ?? false)"
                    [describedBy]="describedBy(field)"
                    (valueChange)="setValue(field.key, $event)"
                    (blurred)="markTouched(field.key)"
                  />
                } @else if (isInputField(field)) {
                  <syn-input
                    [id]="fieldId(field)"
                    [label]="field.label"
                    [type]="field.type"
                    [value]="stringValue(field.key)"
                    [placeholder]="placeholder(field)"
                    [required]="field.required ?? false"
                    [disabled]="disabled() || (field.disabled ?? false)"
                    [describedBy]="describedBy(field)"
                    (valueChange)="setValue(field.key, $event)"
                    (blurred)="markTouched(field.key)"
                  />
                } @else if (field.type === 'select') {
                  <syn-select
                    [id]="fieldId(field)"
                    [label]="field.label"
                    [value]="stringValue(field.key)"
                    [options]="selectOptions(field)"
                    [required]="field.required ?? false"
                    [disabled]="disabled() || (field.disabled ?? false)"
                    (valueChange)="setValue(field.key, $event)"
                  />
                } @else if (field.type === 'checkbox') {
                  <syn-checkbox
                    [id]="fieldId(field)"
                    [label]="field.label"
                    [checked]="booleanValue(field.key)"
                    [disabled]="disabled() || (field.disabled ?? false)"
                    (checkedChange)="handleCheckboxChange(field.key, $event)"
                  />
                } @else {
                  <fieldset class="syn-configurable-form__radio-set">
                    <legend class="syn-configurable-form__legend">{{ field.label }}</legend>

                    <div class="syn-configurable-form__radio-options">
                      @for (option of radioOptions(field); track option.value; let index = $index) {
                        <syn-radio
                          [id]="radioId(field, index)"
                          [name]="field.key"
                          [label]="option.label"
                          [value]="option.value"
                          [checked]="stringValue(field.key) === option.value"
                          [disabled]="disabled() || (field.disabled ?? false) || (option.disabled ?? false)"
                          (selected)="handleRadioSelected(field.key, $event)"
                        />
                      }
                    </div>
                  </fieldset>
                }

                @if (field.description) {
                  <p class="syn-configurable-form__field-description">
                    {{ field.description }}
                  </p>
                }

                @if (field.helperText && !fieldError(field)) {
                  <p class="syn-configurable-form__helper" [id]="helperId(field)">
                    {{ field.helperText }}
                  </p>
                }

                @if (fieldError(field)) {
                  <p class="syn-configurable-form__error" [id]="errorId(field)">
                    {{ fieldError(field) }}
                  </p>
                }
              </div>
            }
          </div>
        </section>
      }

      <div class="syn-configurable-form__actions">
        @if (secondaryActionLabel()) {
          <syn-button
            variant="ghost"
            [label]="secondaryActionLabel()"
            [disabled]="disabled()"
            (pressed)="secondaryAction.emit()"
          />
        }

        <syn-button
          type="submit"
          [label]="submitLabel()"
          [disabled]="disabled()"
          [variant]="submitVariant()"
        />
      </div>
    </form>
  `,
  styleUrl: './configurable-form.scss',
})
export class ConfigurableFormComponent {
  readonly #formId = nextFormId();

  readonly title = input('');
  readonly description = input('');
  readonly sections = input<readonly ConfigurableFormSection[]>([]);
  readonly submitLabel = input('Continue');
  readonly submitVariant = input<'solid' | 'outline' | 'ghost'>('solid');
  readonly secondaryActionLabel = input('');
  readonly disabled = input(false);
  readonly compact = input(false);

  readonly #values = linkedSignal(() => this.createInitialValues());
  readonly #touched = linkedSignal(() => this.createInitialTouchedState());
  readonly #submitted = linkedSignal(() => false);

  readonly fieldChanged = output<ConfigurableFormFieldChange>();
  readonly secondaryAction = output<void>();
  readonly submitted = output<ConfigurableFormSubmitEvent>();

  readonly errors = computed(() => this.collectErrors());
  readonly errorMap = computed(() => {
    const entries = this.errors().map((error) => [error.field, error.message] as const);
    return new Map(entries);
  });
  readonly formClass = computed(() =>
    classNames(
      'syn-configurable-form',
      this.compact() && 'syn-configurable-form--compact',
      this.disabled() && 'syn-configurable-form--disabled',
    ),
  );

  stringValue(key: string): string {
    const value = this.#values()[key];
    return typeof value === 'string' ? value : '';
  }

  booleanValue(key: string): boolean {
    return this.#values()[key] === true;
  }

  setValue(key: string, value: ConfigurableFormValue): void {
    this.#values.update((current) => ({
      ...current,
      [key]: value,
    }));
    this.markTouched(key);
    this.fieldChanged.emit({ key, value });
  }

  handleCheckboxChange(key: string, checked: boolean): void {
    this.setValue(key, checked);
  }

  handleRadioSelected(key: string, value: string): void {
    this.setValue(key, value);
  }

  markTouched(key: string): void {
    this.#touched.update((current) => ({
      ...current,
      [key]: true,
    }));
  }

  fieldError(field: ConfigurableFormField): string {
    if (!this.shouldShowFieldError(field.key)) {
      return '';
    }

    return this.errorMap().get(field.key) ?? '';
  }

  fieldId(field: ConfigurableFormField): string {
    return `${this.#formId}-${field.key}`;
  }

  radioId(field: ConfigurableFormField, index: number): string {
    return `${this.fieldId(field)}-${index}`;
  }

  helperId(field: ConfigurableFormField): string {
    return `${this.fieldId(field)}-helper`;
  }

  errorId(field: ConfigurableFormField): string {
    return `${this.fieldId(field)}-error`;
  }

  describedBy(field: ConfigurableFormField): string {
    const ids: string[] = [];
    if (field.helperText && !this.fieldError(field)) {
      ids.push(this.helperId(field));
    }
    if (this.fieldError(field)) {
      ids.push(this.errorId(field));
    }
    return ids.join(' ');
  }

  fieldClass(field: ConfigurableFormField): string {
    return classNames(
      'syn-configurable-form__field',
      `syn-configurable-form__field--${field.width ?? 'full'}`,
      this.fieldError(field).length > 0 && 'syn-configurable-form__field--invalid',
    );
  }

  placeholder(field: ConfigurableFormField): string {
    if ('placeholder' in field) {
      return field.placeholder ?? '';
    }

    return '';
  }

  selectOptions(
    field: ConfigurableFormField,
  ): readonly { value: string; label: string; disabled?: boolean }[] {
    if (field.type !== 'select') {
      return [];
    }

    const options = field.options.map((option) => ({
      value: option.value,
      label: option.label,
      disabled: option.disabled,
    }));

    if (!field.placeholderLabel) {
      return options;
    }

    return [{ value: '', label: field.placeholderLabel }, ...options];
  }

  radioOptions(field: ConfigurableFormField): readonly ConfigurableFormOption[] {
    return field.type === 'radio' ? field.options : [];
  }

  isInputField(field: ConfigurableFormField): field is ConfigurableFormTextField {
    return (
      field.type === 'text' ||
      field.type === 'email' ||
      field.type === 'password' ||
      field.type === 'search'
    );
  }

  submit(event: Event): void {
    event.preventDefault();
    this.#submitted.set(true);

    this.submitted.emit({
      values: this.cloneValues(this.#values()),
      valid: this.errors().length === 0,
      errors: this.errors(),
    });
  }

  trackSection(section: ConfigurableFormSection, index: number): string {
    return section.id ?? `section-${index}`;
  }

  private shouldShowFieldError(key: string): boolean {
    return this.#submitted() || this.#touched()[key] === true;
  }

  private createInitialValues(): Record<string, ConfigurableFormValue> {
    const values: Record<string, ConfigurableFormValue> = {};

    for (const section of this.sections()) {
      for (const field of section.fields) {
        values[field.key] = this.initialFieldValue(field);
      }
    }

    return values;
  }

  private createInitialTouchedState(): Record<string, boolean> {
    const touched: Record<string, boolean> = {};

    for (const section of this.sections()) {
      for (const field of section.fields) {
        touched[field.key] = false;
      }
    }

    return touched;
  }

  private initialFieldValue(field: ConfigurableFormField): ConfigurableFormValue {
    if (field.type === 'checkbox') {
      return field.initialValue ?? false;
    }

    if ('initialValue' in field) {
      return field.initialValue ?? '';
    }

    return '';
  }

  private collectErrors(): FieldError[] {
    const errors: FieldError[] = [];

    for (const section of this.sections()) {
      for (const field of section.fields) {
        const message = this.validateField(field, this.#values()[field.key]);
        if (!message) {
          continue;
        }

        errors.push({
          field: field.key,
          message,
        });
      }
    }

    return errors;
  }

  private validateField(field: ConfigurableFormField, value: ConfigurableFormValue | undefined): string | undefined {
    if (field.type === 'checkbox') {
      if (field.required && value !== true) {
        return 'This field is required.';
      }

      return undefined;
    }

    const textValue = typeof value === 'string' ? value.trim() : '';

    if (field.required && textValue.length === 0) {
      return 'This field is required.';
    }

    if (textValue.length === 0) {
      return undefined;
    }

    if (field.type === 'email' && !EMAIL_PATTERN.test(textValue)) {
      return 'Enter a valid email address.';
    }

    if ('minLength' in field && field.minLength !== undefined && textValue.length < field.minLength) {
      return `Enter at least ${field.minLength} characters.`;
    }

    if ('maxLength' in field && field.maxLength !== undefined && textValue.length > field.maxLength) {
      return `Enter no more than ${field.maxLength} characters.`;
    }

    if ('pattern' in field && field.pattern) {
      const matcher = new RegExp(field.pattern);
      if (!matcher.test(textValue)) {
        return 'Enter a valid value.';
      }
    }

    return undefined;
  }

  private cloneValues(
    values: Record<string, ConfigurableFormValue>,
  ): Readonly<Record<string, ConfigurableFormValue>> {
    return { ...values };
  }
}
