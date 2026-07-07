import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

/**
 * SH-9 — `syn-dynamic-form` (catálogo §1.3 doc 21, contrato D3).
 *
 * The reusable P13 organism: a **schema-driven multi-step form** rendered as a
 * GOV.UK **task-list** (sections as "tasks" with a status tag: not-started /
 * in-progress / completed) → step-by-step navigation → **check-answers** (review
 * every answer before submitting) → per-field validation (required + pattern)
 * surfaced through an accessible **error summary** (focus moves to the summary,
 * each error links to its field, `aria-invalid` + `aria-describedby` wire the
 * field to its message).
 *
 * **Domain-free:** it never knows what a "trámite", a "cita" or a "solicitud" is —
 * it only knows fields, sections, required and pattern. A domain feeds a
 * `FormSchema` in and reads `{ answers }` back out on `submit`; `change` fires on
 * every keystroke. All copy is overridable via `config`.
 *
 * Pure signals, zoneless, standalone. No engine, no HTTP — the consumer resolves
 * `submit` against its own seam.
 */

/** Field input types the renderer supports. */
export type DynamicFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'email'
  | 'tel';

/** One selectable option (select / radio). */
export interface DynamicFieldOption {
  readonly value: string;
  readonly label: string;
}

/** One field of a section. */
export interface DynamicFormField {
  readonly id: string;
  readonly label: string;
  readonly type: DynamicFieldType;
  readonly required?: boolean;
  /** Plain-language help under the label (lenguaje claro). */
  readonly help?: string;
  /** Options for `select`/`radio`; ignored otherwise. */
  readonly options?: readonly DynamicFieldOption[];
  /** Regex source string; validated when the field has a value. */
  readonly pattern?: string;
  readonly placeholder?: string;
}

/** One section = one "task" of the task-list. */
export interface DynamicFormSection {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly DynamicFormField[];
}

/** The whole form definition — the single input that drives the shell. */
export interface FormSchema {
  readonly title?: string;
  readonly sections: readonly DynamicFormSection[];
}

/** Task status tag (GOV.UK task-list). */
export type TaskStatus = 'not-started' | 'in-progress' | 'completed';

/** Copy config. Everything optional — sane Spanish/GOV.UK-plain defaults. */
export interface DynamicFormConfig {
  readonly taskListLabel?: string;
  readonly statusNotStarted?: string;
  readonly statusInProgress?: string;
  readonly statusCompleted?: string;
  readonly optionalHint?: string;
  readonly errorSummaryTitle?: string;
  readonly requiredError?: string;
  readonly patternError?: string;
  readonly backLabel?: string;
  readonly continueLabel?: string;
  readonly reviewLabel?: string;
  readonly changeLabel?: string;
  readonly submitLabel?: string;
  readonly submittingLabel?: string;
  readonly checkAnswersTitle?: string;
  readonly emptyAnswer?: string;
  readonly selectPlaceholder?: string;
}

/** Answers map: `field.id → value`. Checkboxes store `'true'`/`''`. */
export type DynamicFormAnswers = Readonly<Record<string, string>>;

/** Emitted on submit with all collected answers. */
export interface DynamicFormSubmit {
  readonly answers: DynamicFormAnswers;
}

/** Emitted on every answer change. */
export interface DynamicFormChange {
  readonly fieldId: string;
  readonly value: string;
  readonly answers: DynamicFormAnswers;
}

/** One resolved validation error (field + message). */
interface FieldError {
  readonly fieldId: string;
  readonly label: string;
  readonly message: string;
}

const DEFAULTS: Required<DynamicFormConfig> = {
  taskListLabel: 'Tareas del formulario',
  statusNotStarted: 'No iniciada',
  statusInProgress: 'En progreso',
  statusCompleted: 'Completada',
  optionalHint: '(opcional)',
  errorSummaryTitle: 'Hay un problema',
  requiredError: 'Complete este campo',
  patternError: 'Revise el formato de este campo',
  backLabel: 'Atrás',
  continueLabel: 'Continuar',
  reviewLabel: 'Revisar respuestas',
  changeLabel: 'Cambiar',
  submitLabel: 'Enviar',
  submittingLabel: 'Enviando…',
  checkAnswersTitle: 'Revise sus respuestas antes de enviar',
  emptyAnswer: 'Sin responder',
  selectPlaceholder: 'Seleccione…',
};

/** The addressable "steps": one per section, then the check-answers page. */
type StepView = { readonly kind: 'section'; readonly index: number } | { readonly kind: 'review' };

let dynamicFormInstanceId = 0;

@Component({
  selector: 'syn-dynamic-form',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-dynamic-form' },
  styleUrl: './dynamic-form-shell.scss',
  template: `
    <div class="syn-dform">
      @if (schema().title) {
        <h1 class="syn-dform__title">{{ schema().title }}</h1>
      }

      <!-- ─── GOV.UK task-list ─────────────────────────────────────────────── -->
      <ol class="syn-dform__tasks" [attr.aria-label]="text().taskListLabel">
        @for (section of sections(); track section.id; let i = $index) {
          <li class="syn-dform__task" [class.is-active]="isSectionActive(i)">
            <button
              type="button"
              class="syn-dform__task-btn"
              [class.is-active]="isSectionActive(i)"
              [attr.aria-current]="isSectionActive(i) ? 'step' : null"
              (click)="goToSection(i)"
            >
              <span class="syn-dform__task-num" aria-hidden="true">{{ i + 1 }}</span>
              <span class="syn-dform__task-label">{{ section.title }}</span>
              <span
                class="syn-dform__tag"
                [class]="'syn-dform__tag--' + statusOf(section)"
              >{{ statusLabel(statusOf(section)) }}</span>
            </button>
          </li>
        }
        <li class="syn-dform__task" [class.is-active]="view().kind === 'review'">
          <button
            type="button"
            class="syn-dform__task-btn"
            [class.is-active]="view().kind === 'review'"
            [disabled]="!allSectionsComplete()"
            [attr.aria-current]="view().kind === 'review' ? 'step' : null"
            (click)="goToReview()"
          >
            <span class="syn-dform__task-num" aria-hidden="true">✓</span>
            <span class="syn-dform__task-label">{{ text().reviewLabel }}</span>
            <span
              class="syn-dform__tag"
              [class]="'syn-dform__tag--' + (allSectionsComplete() ? 'completed' : 'not-started')"
            >{{ allSectionsComplete() ? text().statusCompleted : text().statusNotStarted }}</span>
          </button>
        </li>
      </ol>

      <div class="syn-dform__panel">
        <!-- ─── Accessible error summary ──────────────────────────────────── -->
        @if (visibleErrors().length > 0) {
          <div
            class="syn-dform__errors"
            role="alert"
            tabindex="-1"
            [attr.id]="fieldId + '-errors'"
            #errorSummary
          >
            <h2 class="syn-dform__errors-title">{{ text().errorSummaryTitle }}</h2>
            <ul class="syn-dform__errors-list">
              @for (err of visibleErrors(); track err.fieldId) {
                <li>
                  <a class="syn-dform__errors-link" [href]="'#' + controlId(err.fieldId)" (click)="focusField($event, err.fieldId)">
                    {{ err.message }}: {{ err.label }}
                  </a>
                </li>
              }
            </ul>
          </div>
        }

        @switch (view().kind) {
          <!-- ─── A section step ──────────────────────────────────────────── -->
          @case ('section') {
            @if (activeSection(); as section) {
              <section class="syn-dform__section" [attr.aria-label]="section.title">
                <h2 class="syn-dform__section-title">{{ section.title }}</h2>

                @for (field of section.fields; track field.id) {
                  <div
                    class="syn-dform__field"
                    [class.syn-dform__field--full]="field.type === 'textarea'"
                    [class.has-error]="errorFor(field.id) !== ''"
                  >
                    @if (field.type === 'checkbox') {
                      <label class="syn-dform__check" [attr.for]="controlId(field.id)">
                        <input
                          type="checkbox"
                          [id]="controlId(field.id)"
                          [checked]="answerOf(field.id) === 'true'"
                          [attr.aria-invalid]="errorFor(field.id) !== '' ? 'true' : null"
                          [attr.aria-describedby]="describedBy(field)"
                          (change)="onCheckbox(field.id, $event)"
                        />
                        <span class="syn-dform__check-label">
                          {{ field.label }}
                          @if (!field.required) { <em class="syn-dform__opt">{{ text().optionalHint }}</em> }
                        </span>
                      </label>
                      @if (field.help) {
                        <span class="syn-dform__help" [id]="controlId(field.id) + '-help'">{{ field.help }}</span>
                      }
                    } @else {
                      <label class="syn-dform__label" [attr.for]="controlId(field.id)">
                        {{ field.label }}
                        @if (!field.required) { <em class="syn-dform__opt">{{ text().optionalHint }}</em> }
                      </label>
                      @if (field.help) {
                        <span class="syn-dform__help" [id]="controlId(field.id) + '-help'">{{ field.help }}</span>
                      }

                      @switch (field.type) {
                        @case ('textarea') {
                          <textarea
                            class="syn-dform__control"
                            rows="3"
                            [id]="controlId(field.id)"
                            [value]="answerOf(field.id)"
                            [attr.placeholder]="field.placeholder || null"
                            [attr.aria-invalid]="errorFor(field.id) !== '' ? 'true' : null"
                            [attr.aria-describedby]="describedBy(field)"
                            (input)="onInput(field.id, $event)"
                          ></textarea>
                        }
                        @case ('select') {
                          <select
                            class="syn-dform__control"
                            [id]="controlId(field.id)"
                            [value]="answerOf(field.id)"
                            [attr.aria-invalid]="errorFor(field.id) !== '' ? 'true' : null"
                            [attr.aria-describedby]="describedBy(field)"
                            (change)="onInput(field.id, $event)"
                          >
                            <option value="">{{ text().selectPlaceholder }}</option>
                            @for (opt of field.options || []; track opt.value) {
                              <option [value]="opt.value">{{ opt.label }}</option>
                            }
                          </select>
                        }
                        @case ('radio') {
                          <div
                            class="syn-dform__radios"
                            role="radiogroup"
                            [attr.aria-label]="field.label"
                            [attr.aria-describedby]="describedBy(field)"
                          >
                            @for (opt of field.options || []; track opt.value; let ri = $index) {
                              <label class="syn-dform__radio" [attr.for]="controlId(field.id) + '-' + ri">
                                <input
                                  type="radio"
                                  [id]="ri === 0 ? controlId(field.id) : controlId(field.id) + '-' + ri"
                                  [name]="controlId(field.id)"
                                  [value]="opt.value"
                                  [checked]="answerOf(field.id) === opt.value"
                                  (change)="onValue(field.id, opt.value)"
                                />
                                <span>{{ opt.label }}</span>
                              </label>
                            }
                          </div>
                        }
                        @case ('file') {
                          <input
                            type="file"
                            class="syn-dform__control"
                            [id]="controlId(field.id)"
                            [attr.aria-invalid]="errorFor(field.id) !== '' ? 'true' : null"
                            [attr.aria-describedby]="describedBy(field)"
                            (change)="onFile(field.id, $event)"
                          />
                          @if (answerOf(field.id)) {
                            <span class="syn-dform__file-name">{{ answerOf(field.id) }}</span>
                          }
                        }
                        @default {
                          <input
                            class="syn-dform__control"
                            [type]="field.type"
                            [id]="controlId(field.id)"
                            [value]="answerOf(field.id)"
                            [attr.placeholder]="field.placeholder || null"
                            [attr.inputmode]="field.type === 'number' ? 'numeric' : null"
                            [attr.aria-invalid]="errorFor(field.id) !== '' ? 'true' : null"
                            [attr.aria-describedby]="describedBy(field)"
                            (input)="onInput(field.id, $event)"
                          />
                        }
                      }
                    }

                    @if (errorFor(field.id); as message) {
                      <span class="syn-dform__error" [id]="controlId(field.id) + '-error'" role="alert">
                        {{ message }}
                      </span>
                    }
                  </div>
                }
              </section>
            }
          }

          <!-- ─── Check-answers ───────────────────────────────────────────── -->
          @case ('review') {
            <section class="syn-dform__review" [attr.aria-label]="text().checkAnswersTitle">
              <h2 class="syn-dform__section-title">{{ text().checkAnswersTitle }}</h2>
              @for (section of sections(); track section.id; let i = $index) {
                <div class="syn-dform__review-group">
                  <div class="syn-dform__review-head">
                    <h3 class="syn-dform__review-title">{{ section.title }}</h3>
                    <button type="button" class="syn-dform__change" (click)="goToSection(i)">
                      {{ text().changeLabel }}
                    </button>
                  </div>
                  <dl class="syn-dform__answers">
                    @for (field of section.fields; track field.id) {
                      <div class="syn-dform__answer-row">
                        <dt>{{ field.label }}</dt>
                        <dd>{{ displayAnswer(field) || text().emptyAnswer }}</dd>
                      </div>
                    }
                  </dl>
                </div>
              }
            </section>
          }
        }

        <!-- ─── Actions ─────────────────────────────────────────────────────── -->
        <div class="syn-dform__actions">
          <button type="button" class="syn-dform__btn" (click)="back()" [disabled]="submitting()">
            {{ text().backLabel }}
          </button>
          @if (view().kind === 'review') {
            <button
              type="button"
              class="syn-dform__btn syn-dform__btn--primary"
              [disabled]="submitting()"
              (click)="submit()"
            >
              {{ submitting() ? text().submittingLabel : text().submitLabel }}
            </button>
          } @else {
            <button
              type="button"
              class="syn-dform__btn syn-dform__btn--primary"
              (click)="continueStep()"
            >
              {{ text().continueLabel }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class DynamicFormShellComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly schema = input.required<FormSchema>();
  readonly config = input<DynamicFormConfig>({});
  /** `true` while the consumer resolves `submit` against its seam. */
  readonly submitting = input(false);

  // ─── Outputs (named to avoid native DOM-event clashes: no `submit`/`change`) ─
  /** Emitted with all answers when the check-answers page is submitted. */
  readonly formsubmit = output<DynamicFormSubmit>();
  /** Emitted on every field value change. */
  readonly answerchange = output<DynamicFormChange>();
  /** Fired when the active step changes (section index or `'review'`). */
  readonly stepchange = output<string>();

  readonly fieldId = `syn-dform-${(dynamicFormInstanceId += 1)}`;

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly answers = linkedSignal<FormSchema, DynamicFormAnswers>({
    source: this.schema,
    computation: () => ({}),
  });
  /** Which step is on screen. Resets to the first section when the schema changes. */
  readonly view = linkedSignal<FormSchema, StepView>({
    source: this.schema,
    computation: () => ({ kind: 'section', index: 0 }),
  });
  /** Sections the user has attempted to advance past — gates when errors show. */
  readonly attempted = signal<ReadonlySet<number>>(new Set());

  readonly sections = computed(() => this.schema().sections);

  readonly text = computed<Required<DynamicFormConfig>>(() => ({ ...DEFAULTS, ...this.config() }));

  readonly activeSection = computed<DynamicFormSection | null>(() => {
    const current = this.view();
    return current.kind === 'section' ? (this.sections()[current.index] ?? null) : null;
  });

  /** Errors of the section currently on screen (empty on the review page). */
  readonly activeErrors = computed<readonly FieldError[]>(() => {
    const section = this.activeSection();
    return section ? this.errorsOf(section) : [];
  });

  /** Error summary only shows after the user tried to advance the active section. */
  readonly visibleErrors = computed<readonly FieldError[]>(() => {
    const current = this.view();
    if (current.kind !== 'section' || !this.attempted().has(current.index)) {
      return [];
    }
    return this.activeErrors();
  });

  readonly allSectionsComplete = computed(() =>
    this.sections().every((section) => this.errorsOf(section).length === 0),
  );

  // ─── Task-list status ───────────────────────────────────────────────────────
  statusOf(section: DynamicFormSection): TaskStatus {
    const answers = this.answers();
    const answered = section.fields.filter((field) => (answers[field.id] ?? '') !== '').length;
    if (this.errorsOf(section).length === 0 && answered > 0) {
      return 'completed';
    }
    // A section with no answers is "not started" only if untouched; a partial
    // answer (or a required gap after an answer) reads as "in progress".
    return answered === 0 ? 'not-started' : 'in-progress';
  }

  statusLabel(status: TaskStatus): string {
    switch (status) {
      case 'completed':
        return this.text().statusCompleted;
      case 'in-progress':
        return this.text().statusInProgress;
      default:
        return this.text().statusNotStarted;
    }
  }

  isSectionActive(index: number): boolean {
    const current = this.view();
    return current.kind === 'section' && current.index === index;
  }

  // ─── Validation ─────────────────────────────────────────────────────────────
  private errorsOf(section: DynamicFormSection): readonly FieldError[] {
    const answers = this.answers();
    const errors: FieldError[] = [];
    for (const field of section.fields) {
      const value = (answers[field.id] ?? '').trim();
      if (field.required && value === '') {
        errors.push({ fieldId: field.id, label: field.label, message: this.text().requiredError });
        continue;
      }
      if (value !== '' && field.pattern) {
        let re: RegExp | null = null;
        try {
          re = new RegExp(field.pattern);
        } catch {
          re = null;
        }
        if (re && !re.test(value)) {
          errors.push({ fieldId: field.id, label: field.label, message: this.text().patternError });
        }
      }
    }
    return errors;
  }

  errorFor(fieldId: string): string {
    return this.visibleErrors().find((err) => err.fieldId === fieldId)?.message ?? '';
  }

  // ─── Answer access ──────────────────────────────────────────────────────────
  answerOf(fieldId: string): string {
    return this.answers()[fieldId] ?? '';
  }

  /** Display value for check-answers: select/radio show the option label. */
  displayAnswer(field: DynamicFormField): string {
    const raw = this.answerOf(field.id);
    if (field.type === 'checkbox') {
      return raw === 'true' ? 'Sí' : 'No';
    }
    if (field.type === 'select' || field.type === 'radio') {
      return (field.options ?? []).find((opt) => opt.value === raw)?.label ?? raw;
    }
    return raw;
  }

  controlId(fieldId: string): string {
    return `${this.fieldId}-${fieldId}`;
  }

  describedBy(field: DynamicFormField): string | null {
    const parts: string[] = [];
    if (field.help) {
      parts.push(`${this.controlId(field.id)}-help`);
    }
    if (this.errorFor(field.id) !== '') {
      parts.push(`${this.controlId(field.id)}-error`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }

  // ─── Input handlers ─────────────────────────────────────────────────────────
  onInput(fieldId: string, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    this.onValue(fieldId, target?.value ?? '');
  }

  onCheckbox(fieldId: string, event: Event): void {
    this.onValue(fieldId, (event.target as HTMLInputElement | null)?.checked ? 'true' : '');
  }

  onFile(fieldId: string, event: Event): void {
    const files = (event.target as HTMLInputElement | null)?.files;
    this.onValue(fieldId, files && files.length > 0 ? files[0].name : '');
  }

  onValue(fieldId: string, value: string): void {
    const next = { ...this.answers(), [fieldId]: value };
    this.answers.set(next);
    this.answerchange.emit({ fieldId, value, answers: next });
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────
  goToSection(index: number): void {
    if (index < 0 || index >= this.sections().length) {
      return;
    }
    this.view.set({ kind: 'section', index });
    this.stepchange.emit(String(index));
  }

  goToReview(): void {
    if (!this.allSectionsComplete()) {
      // Reveal errors on the first incomplete section instead of jumping.
      const firstBad = this.sections().findIndex((section) => this.errorsOf(section).length > 0);
      if (firstBad >= 0) {
        this.markAttempted(firstBad);
        this.goToSection(firstBad);
        this.focusErrorSummary();
      }
      return;
    }
    this.view.set({ kind: 'review' });
    this.stepchange.emit('review');
  }

  continueStep(): void {
    const current = this.view();
    if (current.kind !== 'section') {
      return;
    }
    this.markAttempted(current.index);
    if (this.activeErrors().length > 0) {
      this.focusErrorSummary();
      return;
    }
    const next = current.index + 1;
    if (next < this.sections().length) {
      this.goToSection(next);
    } else {
      this.goToReview();
    }
  }

  back(): void {
    const current = this.view();
    if (current.kind === 'review') {
      this.goToSection(this.sections().length - 1);
      return;
    }
    if (current.index > 0) {
      this.goToSection(current.index - 1);
    }
  }

  private markAttempted(index: number): void {
    if (this.attempted().has(index)) {
      return;
    }
    this.attempted.update((set) => new Set(set).add(index));
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────
  submit(): void {
    if (this.submitting() || !this.allSectionsComplete()) {
      if (!this.allSectionsComplete()) {
        this.goToReview(); // routes the user to the first incomplete section
      }
      return;
    }
    this.formsubmit.emit({ answers: this.answers() });
  }

  // ─── Focus management (WCAG) ────────────────────────────────────────────────
  focusField(event: Event, fieldId: string): void {
    event.preventDefault();
    const el = this.#host.nativeElement.querySelector<HTMLElement>(`#${cssEscape(this.controlId(fieldId))}`);
    el?.focus();
  }

  private focusErrorSummary(): void {
    // Defer to the next frame so the summary is rendered before we move focus.
    queueMicrotask(() => {
      const summary = this.#host.nativeElement.querySelector<HTMLElement>(`#${cssEscape(this.fieldId)}-errors`);
      summary?.focus();
    });
  }
}

/** Minimal CSS.escape fallback (ids here are `[a-z0-9-]`, but stay defensive). */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
