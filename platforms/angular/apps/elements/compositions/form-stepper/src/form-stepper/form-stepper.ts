import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CampoDelFormulario, FormStepperProps, PasoDelFormulario } from '@synergos/contracts';
import {
  LiveAnnouncerService,
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
} from '@synergos/shared';
import { t } from '@synergos/vitals-core';

/**
 * Web Component del elemento del CMS `elementSynFormStepper`: un formulario del sitio presentado por
 * pasos (#196, tanda D).
 *
 * Es un formulario del modelo de Forms (ADR 0018/0030): el `config` que manda el CMS tiene la forma
 * de `FormStepperProps`, GENERADO del record C# (ADR 0135), con los pasos y los campos que el editor
 * compuso con `elementFormStep` y `elementFormField`, la clave del formulario, y dónde vive la API y
 * cómo se llama el campo trampa, que son del despliegue (ADR 0137). El servidor exige los
 * obligatorios con esta MISMA definición.
 *
 * **Sólo dice «enviado» si el servidor lo confirmó.** Antes pintaba «¡Gracias! Tu información fue
 * enviada» y despachaba un evento que nadie escuchaba: el envío no salía nunca. Ahora envía a
 * `${apiBase}/${formKey}/submit` pidiendo JSON, y el evento `synergos:form-stepper:complete` sale
 * después de la confirmación. Sin base o sin clave no se llama a nada y se dice que no se pudo.
 *
 * Sus textos son los de los formularios del sitio, del diccionario (`Form.*`, ADR 0136).
 */

/** El `config` que manda el CMS (ver `FormStepperProps`). */
export type FormStepperConfig = Partial<FormStepperProps>;

type FieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'checkbox';

const FIELD_TYPES: readonly FieldType[] = ['text', 'email', 'tel', 'number', 'textarea', 'select', 'checkbox'];

type FieldValue = string | boolean;

/** En qué punto está el envío. */
type EstadoDelEnvio = 'editando' | 'enviando' | 'enviado' | 'error';

interface StepField {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly placeholder: string;
  readonly helpText: string;
  readonly options: readonly string[];
}

interface FormStep {
  readonly title: string;
  readonly description: string;
  readonly fields: readonly StepField[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeOptions(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const options = value.map((o) => coerceTrimmedStringInput(o)).filter((o): o is string => !!o);
  return options.length ? options : undefined;
}

function sanitizeField(value: unknown): CampoDelFormulario | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = coerceTrimmedStringInput(value['name']);
  const label = coerceTrimmedStringInput(value['label']);
  if (!name || !label) {
    return null;
  }
  // Nombre, etiqueta, tipo y obligatoriedad están siempre: el Partial sólo suelta los opcionales.
  return omitUndefinedProperties<CampoDelFormulario>({
    name,
    label,
    type: coerceTrimmedStringInput(value['type'])?.toLowerCase() ?? 'text',
    required: value['required'] === true,
    placeholder: coerceTrimmedStringInput(value['placeholder']),
    helpText: coerceTrimmedStringInput(value['helpText']),
    options: sanitizeOptions(value['options']),
  }) as CampoDelFormulario;
}

function sanitizeStep(value: unknown): PasoDelFormulario | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = coerceTrimmedStringInput(value['title']);
  const fields = Array.isArray(value['fields'])
    ? value['fields'].map(sanitizeField).filter((f): f is CampoDelFormulario => f !== null)
    : [];
  if (!title || fields.length === 0) {
    return null;
  }
  return omitUndefinedProperties<PasoDelFormulario>({
    title,
    fields,
    description: coerceTrimmedStringInput(value['description']),
  }) as PasoDelFormulario;
}

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeFormStepperConfig(value: FormStepperConfig): FormStepperConfig {
  const steps = Array.isArray(value.steps)
    ? value.steps.map(sanitizeStep).filter((s): s is PasoDelFormulario => s !== null)
    : undefined;
  return omitUndefinedProperties<FormStepperProps>({
    formKey: coerceTrimmedStringInput(value.formKey),
    steps: steps?.length ? steps : undefined,
    allowSkip: coerceOptionalBooleanInput(value.allowSkip),
    apiBase: coerceTrimmedStringInput(value.apiBase),
    honeypotField: coerceTrimmedStringInput(value.honeypotField),
  });
}

function toFieldType(value: string): FieldType {
  const type = value as FieldType;
  return FIELD_TYPES.includes(type) ? type : 'text';
}

/** Un select sin opciones se pinta como texto, igual que en el formulario SSR. */
function toStepField(campo: CampoDelFormulario): StepField {
  const options = campo.options ?? [];
  const type = toFieldType(campo.type);
  return {
    name: campo.name,
    label: campo.label,
    type: type === 'select' && options.length === 0 ? 'text' : type,
    required: campo.required,
    placeholder: campo.placeholder ?? '',
    helpText: campo.helpText ?? '',
    options,
  };
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
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #announcer = inject(LiveAnnouncerService);

  readonly config = input<FormStepperConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FormStepperProps>(sanitizeFormStepperConfig),
  });

  readonly #currentIndex = signal(0);
  readonly #values = signal<Record<string, FieldValue>>({});
  readonly #errors = signal<ReadonlySet<string>>(new Set());
  readonly #estado = signal<EstadoDelEnvio>('editando');
  readonly #mensajeDeError = signal('');

  readonly allowSkip = computed(() => this.config()?.allowSkip ?? false);
  /** Dónde vive la API. Sin ella no se envía nada: no hay una base de respaldo compilada (ADR 0137). */
  readonly apiBase = computed(() => (this.config()?.apiBase ?? '').replace(/\/+$/, ''));
  readonly formKey = computed(() => this.config()?.formKey ?? '');

  readonly steps = computed<readonly FormStep[]>(() =>
    (this.config()?.steps ?? []).map((paso) => ({
      title: paso.title,
      description: paso.description ?? '',
      fields: paso.fields.map(toStepField),
    })),
  );

  readonly hasSteps = computed(() => this.steps().length > 0);
  readonly stepCount = computed(() => this.steps().length);
  readonly currentIndex = computed(() =>
    Math.min(this.#currentIndex(), Math.max(0, this.stepCount() - 1)),
  );
  readonly currentStep = computed<FormStep | undefined>(() => this.steps()[this.currentIndex()]);
  readonly isFirst = computed(() => this.currentIndex() === 0);
  readonly isLast = computed(() => this.currentIndex() === this.stepCount() - 1);
  /** El servidor confirmó el envío. Es lo único que enciende el «gracias». */
  readonly completed = computed(() => this.#estado() === 'enviado');
  readonly sending = computed(() => this.#estado() === 'enviando');
  readonly errorMessage = computed(() => (this.#estado() === 'error' ? this.#mensajeDeError() : ''));
  readonly errors = computed(() => this.#errors());

  readonly textos = {
    back: () => t('Form.Actions.Back', 'Atrás'),
    next: () => t('Form.Actions.Next', 'Siguiente'),
    submit: () => t('Form.Submit', 'Enviar'),
    sending: () => t('Form.Messages.Sending', 'Enviando…'),
    success: () => t('Form.Messages.Success', '¡Gracias! Tu mensaje ha sido enviado.'),
    required: () => t('Form.Validation.Required', 'Este campo es obligatorio.'),
    selectOption: () => t('Form.Placeholders.SelectOption', 'Selecciona una opción'),
  };

  /** Indicator chips: state for each step (active / completed / upcoming). */
  readonly indicators = computed(() =>
    this.steps().map((step, index) => ({
      index,
      title: step.title,
      active: index === this.currentIndex(),
      completed: index < this.currentIndex() || this.completed(),
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
        value === undefined || value === '' || (field.type === 'checkbox' && value !== true);
      if (isEmpty) {
        missing.add(field.name);
      }
    }

    this.#errors.set(missing);
    return missing.size === 0;
  }

  back(): void {
    if (this.isFirst() || this.sending()) {
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

  /**
   * Envía a la API de formularios del sitio y sólo dice «enviado» si el servidor lo confirma. Un
   * fallo se dice —con el texto del sitio— y deja el formulario como estaba para reintentar.
   */
  async submit(): Promise<void> {
    if (this.sending()) {
      return;
    }
    if (!this.allowSkip() && !this.#validateCurrentStep()) {
      this.#focusFirstError();
      return;
    }

    const apiBase = this.apiBase();
    const formKey = this.formKey();
    if (!apiBase || !formKey || typeof fetch !== 'function') {
      this.#fallo(t('Form.Messages.Error', 'Ocurrió un error. Por favor inténtalo de nuevo.'));
      return;
    }

    this.#estado.set('enviando');
    const values = { ...this.#values() };
    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(formKey)}/submit`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: this.#cuerpo(values),
      });
      await response.body?.cancel();
      if (!response.ok) {
        this.#fallo(t('Form.Messages.Error', 'Ocurrió un error. Por favor inténtalo de nuevo.'));
        return;
      }
    } catch {
      this.#fallo(t('Form.Messages.NetworkError', 'Error de conexión. Inténtalo de nuevo.'));
      return;
    }

    this.#estado.set('enviado');
    this.#host.nativeElement.dispatchEvent(
      new CustomEvent('synergos:form-stepper:complete', {
        detail: { formKey, values },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Los valores, más el campo trampa vacío que el servidor espera de un humano. */
  #cuerpo(values: Record<string, FieldValue>): string {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(values)) {
      if (value === false || value === '') {
        continue;
      }
      params.set(name, value === true ? 'true' : value);
    }
    const trampa = this.config()?.honeypotField;
    if (trampa) {
      params.set(trampa, '');
    }
    return params.toString();
  }

  /**
   * El fallo se ve junto a los botones y se DICE por el anunciador del documento: una región propia
   * que naciera con el mensaje no la leería el lector de pantalla (gate de regiones vivas).
   */
  #fallo(mensaje: string): void {
    this.#mensajeDeError.set(mensaje);
    this.#estado.set('error');
    this.#announcer.announce(mensaje, 'assertive');
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
      const field = this.#host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.focus();
    });
  }
}
