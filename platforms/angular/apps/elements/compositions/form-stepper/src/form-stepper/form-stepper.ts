import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
} from '@synergos/shared';

/**
 * Web Component for the CMS element `elementSynFormStepper`.
 *
 * Renders a multi-step form from a JSON `steps` definition: a numbered step
 * indicator (active / completed), the current step's fields, Back / Next
 * navigation, and a Submit action on the final step. Required fields are
 * validated before advancing. On submit it dispatches a
 * `synergos:form-stepper:complete` CustomEvent carrying the collected values.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias (`stepsJson`, `submitEndpoint`, `allowSkip`, `integration`).
 */

type FieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'checkbox';

interface StepFieldOption {
  readonly value: string;
  readonly label: string;
}

interface StepField {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly placeholder: string;
  readonly options: readonly StepFieldOption[];
}

interface FormStep {
  readonly title: string;
  readonly description: string;
  readonly fields: readonly StepField[];
}

type FieldValue = string | boolean;

const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'email',
  'tel',
  'number',
  'textarea',
  'select',
  'checkbox',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFieldType(value: unknown): FieldType {
  const trimmed = readString(value).trim().toLowerCase() as FieldType;
  return FIELD_TYPES.includes(trimmed) ? trimmed : 'text';
}

function normalizeOption(value: unknown): StepFieldOption | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { value: trimmed, label: trimmed } : null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const optionValue = readString(value['value']).trim();
  if (!optionValue) {
    return null;
  }
  const label = readString(value['label']).trim();
  return { value: optionValue, label: label || optionValue };
}

function normalizeOptions(value: unknown): readonly StepFieldOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((option) => normalizeOption(option))
    .filter((option): option is StepFieldOption => option !== null);
}

function normalizeField(value: unknown, index: number): StepField | null {
  if (!isRecord(value)) {
    return null;
  }
  const label = readString(value['label']).trim();
  const name = readString(value['name']).trim() || (label
    ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    : `field-${index + 1}`);
  if (!label) {
    return null;
  }

  return {
    name,
    label,
    type: normalizeFieldType(value['type']),
    required: value['required'] === true,
    placeholder: readString(value['placeholder']).trim(),
    options: normalizeOptions(value['options']),
  };
}

function normalizeStep(value: unknown): FormStep | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = readString(value['title']).trim();
  if (!title) {
    return null;
  }
  const fields = Array.isArray(value['fields'])
    ? value['fields']
        .map((field, index) => normalizeField(field, index))
        .filter((field): field is StepField => field !== null)
    : [];

  return {
    title,
    description: readString(value['description']).trim(),
    fields,
  };
}

export function normalizeSteps(value: unknown): readonly FormStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((step) => normalizeStep(step))
    .filter((step): step is FormStep => step !== null);
}

@Component({
  selector: 'sg-form-stepper',
  standalone: true,
  templateUrl: './form-stepper.html',
  styleUrl: './form-stepper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-form-stepper' },
})
export class FormStepperElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly stepsJson = input<string | undefined>(undefined);
  readonly submitEndpoint = input<string | undefined>(undefined);
  readonly allowSkipInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'allowSkip',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  readonly #currentIndex = signal(0);
  readonly #values = signal<Record<string, FieldValue>>({});
  readonly #errors = signal<ReadonlySet<string>>(new Set());
  readonly #completed = signal(false);

  readonly allowSkip = computed(() => this.allowSkipInput() ?? false);

  readonly steps = computed<readonly FormStep[]>(() => {
    const parsed = this.#initialData.parseValue<unknown>(this.stepsJson());
    return normalizeSteps(parsed);
  });

  readonly hasSteps = computed(() => this.steps().length > 0);
  readonly stepCount = computed(() => this.steps().length);
  readonly currentIndex = computed(() =>
    Math.min(this.#currentIndex(), Math.max(0, this.stepCount() - 1)),
  );
  readonly currentStep = computed<FormStep | undefined>(() => this.steps()[this.currentIndex()]);
  readonly isFirst = computed(() => this.currentIndex() === 0);
  readonly isLast = computed(() => this.currentIndex() === this.stepCount() - 1);
  readonly completed = computed(() => this.#completed());
  readonly errors = computed(() => this.#errors());

  /** Indicator chips: state for each step (active / completed / upcoming). */
  readonly indicators = computed(() =>
    this.steps().map((step, index) => ({
      index,
      title: step.title,
      active: index === this.currentIndex(),
      completed: index < this.currentIndex() || this.#completed(),
    })),
  );

  /** String-typed accessor for text/textarea/select bindings (strictTemplates). */
  textValue(name: string): string {
    const current = this.#values()[name];
    return typeof current === 'string' ? current : '';
  }

  /** Boolean-typed accessor for checkbox bindings (strictTemplates). */
  isChecked(name: string): boolean {
    return this.#values()[name] === true;
  }

  hasError(name: string): boolean {
    return this.#errors().has(name);
  }

  onTextInput(name: string, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    this.#setValue(name, target.value);
  }

  onCheckboxChange(name: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.#setValue(name, target.checked);
  }

  #setValue(name: string, value: FieldValue): void {
    this.#values.update((current) => ({ ...current, [name]: value }));
    if (this.#errors().has(name)) {
      this.#errors.update((current) => {
        const next = new Set(current);
        next.delete(name);
        return next;
      });
    }
  }

  /** Validate the current step's required fields; returns true when valid. */
  #validateCurrentStep(): boolean {
    const step = this.currentStep();
    if (!step) {
      return false;
    }

    const missing = new Set<string>();
    for (const field of step.fields) {
      if (!field.required) {
        continue;
      }
      const value = this.#values()[field.name];
      const isEmpty =
        value === undefined ||
        value === '' ||
        (field.type === 'checkbox' && value !== true);
      if (isEmpty) {
        missing.add(field.name);
      }
    }

    this.#errors.set(missing);
    return missing.size === 0;
  }

  back(): void {
    if (this.isFirst()) {
      return;
    }
    this.#errors.set(new Set());
    this.#currentIndex.update((index) => Math.max(0, index - 1));
    this.#focusStepHeading();
  }

  next(): void {
    if (!this.allowSkip() && !this.#validateCurrentStep()) {
      this.#focusFirstError();
      return;
    }
    this.#currentIndex.update((index) => Math.min(this.stepCount() - 1, index + 1));
    this.#focusStepHeading();
  }

  submit(): void {
    if (!this.allowSkip() && !this.#validateCurrentStep()) {
      this.#focusFirstError();
      return;
    }

    this.#completed.set(true);

    const detail = {
      values: { ...this.#values() },
      submitEndpoint: coerceTrimmedStringInput(this.submitEndpoint()) ?? null,
    };

    this.#host.nativeElement.dispatchEvent(
      new CustomEvent('synergos:form-stepper:complete', {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  #focusStepHeading(): void {
    queueMicrotask(() => {
      const heading = this.#host.nativeElement.querySelector<HTMLElement>(
        '.form-stepper__step-title',
      );
      heading?.focus();
    });
  }

  #focusFirstError(): void {
    queueMicrotask(() => {
      const field = this.#host.nativeElement.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      field?.focus();
    });
  }
}
