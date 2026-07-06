import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SessionStore, type SessionItem } from '@synergos/transaction-engine';

/**
 * SH-6 — `syn-authoring-wizard` (catálogo §1.3 doc 21).
 *
 * The reusable P6 organism: the "publicar/crear entidad" wizard — a form
 * stepper (`datos → media → precio/config → preview → publicar`) whose step
 * content is rendered through ONE `stepTemplate` switching on the step id, with
 * per-step validation gating and a **persistent draft**. The draft lives in the
 * wizard's own `SessionStore` instance (component-level provider → its own
 * storage scope, never clashing with the domain's cart), so an interrupted
 * "publicar producto" survives a reload — the `I*AuthoringService` pattern's
 * draft→review→publicado lifecycle. **Domain-free:** the wizard never knows
 * what a "GTIN" or a "pin en el mapa" is; steps patch an opaque draft record
 * and the consumer resolves `published` against its own seam. The media
 * uploader is just the consumer's content for its `media` step (dropzone slot).
 */

/** One wizard step. Enabling/disabling steps = including/omitting them here. */
export interface AuthoringStep {
  readonly id: string;
  readonly label: string;
}

/** Copy + behaviour config. `steps` is the only required part. */
export interface AuthoringWizardConfig {
  readonly steps: readonly AuthoringStep[];
  readonly heading?: string;
  readonly stepsLabel?: string;
  readonly backLabel?: string;
  readonly nextLabel?: string;
  /** Label of the final submit button (e.g. "Publicar"). */
  readonly publishLabel?: string;
  readonly publishingLabel?: string;
  /** Storage scope of the persistent draft. Default `authoring`. */
  readonly draftScope?: string;
  /** Draft time-to-live in ms. Default 24 h. */
  readonly draftTtlMs?: number;
}

/** The opaque draft record steps patch into. */
export type AuthoringDraft = Readonly<Record<string, unknown>>;

/** Template context handed to the per-step template. */
export interface AuthoringStepContext {
  readonly $implicit: AuthoringStep;
  readonly index: number;
  /** Live snapshot of the persisted draft. */
  readonly draft: AuthoringDraft;
  /** Merge values into the draft (persists + emits `draftchange`). */
  readonly patch: (values: AuthoringDraft) => void;
}

const DEFAULT_DRAFT_SCOPE = 'authoring';
const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_ITEM_ID = 'authoring-draft';
const DRAFT_FLOW = 'authoring';

@Component({
  selector: 'syn-authoring-wizard',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-authoring-wizard' },
  styleUrl: './authoring-wizard.scss',
  // Own store instance → own draft scope, isolated from the domain cart store.
  providers: [SessionStore],
  template: `
    <div class="syn-authoring">
      @if (config().heading) {
        <h1 class="syn-authoring__heading">{{ config().heading }}</h1>
      }

      <ol class="syn-authoring__steps" [attr.aria-label]="config().stepsLabel || 'Pasos'">
        @for (step of steps(); track step.id; let index = $index) {
          <li
            class="syn-authoring__step"
            [class.is-active]="index === stepIndex()"
            [class.is-done]="index < stepIndex()"
            [attr.aria-current]="index === stepIndex() ? 'step' : null"
          >
            {{ index + 1 }}. {{ step.label }}
          </li>
        }
      </ol>

      @if (currentStep(); as step) {
        <section class="syn-authoring__content" [attr.aria-label]="step.label">
          <ng-container
            [ngTemplateOutlet]="stepTemplate()"
            [ngTemplateOutletContext]="stepContext(step)"
          />
        </section>
      }

      <div class="syn-authoring__actions">
        <button type="button" class="syn-authoring__btn" (click)="previous()">
          {{ config().backLabel || 'Atrás' }}
        </button>
        <button
          type="button"
          class="syn-authoring__btn syn-authoring__btn--primary"
          [disabled]="nextDisabled()"
          (click)="next()"
        >
          {{ nextLabel() }}
        </button>
      </div>
    </div>
  `,
})
export class AuthoringWizardComponent {
  readonly #store = inject(SessionStore);

  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input.required<AuthoringWizardConfig>();
  /** One template renders every step; switch on `$implicit.id` inside it. */
  readonly stepTemplate = input.required<TemplateRef<AuthoringStepContext>>();
  /** Per-step gating: `stepId → can advance`. Missing entries default to valid. */
  readonly validity = input<Readonly<Record<string, boolean>>>({});
  /** `true` while the consumer resolves `published` against its seam. */
  readonly publishing = input(false);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly stepchange = output<string>();
  readonly draftchange = output<AuthoringDraft>();
  /** Emitted on the final step's submit with the full draft payload. */
  readonly published = output<AuthoringDraft>();
  /** Emitted when the user backs out of the first step. */
  readonly exit = output<void>();

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly steps = computed(() => this.config().steps);
  /** Resets to the first step whenever the configured steps change. */
  readonly stepIndex = linkedSignal(() => {
    this.steps();
    return 0;
  });
  readonly draft = signal<AuthoringDraft>({});

  readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? null);
  readonly isLastStep = computed(() => this.stepIndex() === this.steps().length - 1);

  readonly currentStepValid = computed(() => {
    const step = this.currentStep();
    if (!step) {
      return false;
    }
    return this.validity()[step.id] ?? true;
  });

  readonly nextDisabled = computed(() => {
    if (!this.currentStepValid()) {
      return true;
    }
    return this.isLastStep() && this.publishing();
  });

  readonly nextLabel = computed(() => {
    if (this.publishing()) {
      return this.config().publishingLabel || 'Publicando…';
    }
    return this.isLastStep()
      ? this.config().publishLabel || 'Publicar'
      : this.config().nextLabel || 'Continuar';
  });

  #hydratedScope = '';

  constructor() {
    // Bind the draft store to its scope and rehydrate a persisted draft once
    // per scope (survives reloads — the draft→review→publicado lifecycle).
    effect(() => {
      const config = this.config();
      const scope = config.draftScope || DEFAULT_DRAFT_SCOPE;
      if (scope === this.#hydratedScope) {
        return;
      }
      this.#hydratedScope = scope;
      untracked(() => {
        this.#store.init({
          scope,
          flow: DRAFT_FLOW,
          ttlMs: config.draftTtlMs ?? DEFAULT_DRAFT_TTL_MS,
        });
        const persisted = this.#store
          .getValidSession()
          .items.find((item) => item.id === DRAFT_ITEM_ID);
        this.draft.set(persisted ? { ...persisted.selection } : {});
      });
    });
  }

  // ─── Draft ─────────────────────────────────────────────────────────────────
  patchDraft(values: AuthoringDraft): void {
    const next: AuthoringDraft = { ...this.draft(), ...values };
    this.draft.set(next);
    this.#store.addItem(this.draftItem(next));
    this.draftchange.emit(next);
  }

  /** Clear the persisted draft and restart the wizard (post-publish). */
  resetDraft(): void {
    this.#store.reset();
    this.draft.set({});
    this.stepIndex.set(0);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────
  next(): void {
    if (this.nextDisabled()) {
      return;
    }
    if (this.isLastStep()) {
      this.published.emit(this.draft());
      return;
    }
    this.stepIndex.set(this.stepIndex() + 1);
    this.stepchange.emit(this.currentStep()?.id ?? '');
  }

  previous(): void {
    if (this.publishing()) {
      return;
    }
    if (this.stepIndex() === 0) {
      this.exit.emit();
      return;
    }
    this.stepIndex.set(this.stepIndex() - 1);
    this.stepchange.emit(this.currentStep()?.id ?? '');
  }

  stepContext(step: AuthoringStep): AuthoringStepContext {
    return {
      $implicit: step,
      index: this.stepIndex(),
      draft: this.draft(),
      patch: (values) => this.patchDraft(values),
    };
  }

  private draftItem(draft: AuthoringDraft): SessionItem {
    return {
      id: DRAFT_ITEM_ID,
      kind: DRAFT_FLOW,
      productRef: DRAFT_ITEM_ID,
      label: 'Borrador',
      selection: draft,
      amount: 0,
      quantity: 1,
    };
  }
}
