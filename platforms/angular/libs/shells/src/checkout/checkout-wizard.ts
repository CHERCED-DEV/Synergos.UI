import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  FulfillmentContext,
  SessionStore,
  type FulfillmentVoucher,
  type SessionItem,
} from '@synergos/transaction-engine';

/**
 * SH-3 — `syn-checkout-wizard` v2 (catálogo §1.3 doc 21).
 *
 * The reusable P3 organism: a configurable multi-step checkout **over the
 * transaction engine** (`SessionStore` + `FulfillmentContext`). Steps are pure
 * config — a domain turns a step ON by listing it (`datos → [cita] → [pago] →
 * revisar`) and OFF by omitting it (Propiedades/Gobierno run with pago OFF).
 * Step content is rendered through ONE `stepTemplate` that switches on the step
 * id, so the wizard never knows what a "dirección" or a "cita" is.
 *
 * On the final step the wizard drives the engine's generic lifecycle:
 * `pay(instrument) → record payment → confirm → vouchers`, routed by the
 * session's `flow` to whichever `IFulfillmentStrategy` the consumer registered.
 * The wizard itself is domain-free — the strategy is the domain.
 */

/** One wizard step. Enabling/disabling steps = including/omitting them here. */
export interface CheckoutWizardStep {
  readonly id: string;
  readonly label: string;
}

/** Copy + behaviour config. `steps` is the only required part. */
export interface CheckoutWizardConfig {
  readonly steps: readonly CheckoutWizardStep[];
  readonly stepsLabel?: string;
  readonly summaryHeading?: string;
  readonly totalLabel?: string;
  readonly emptyMessage?: string;
  readonly backLabel?: string;
  readonly nextLabel?: string;
  /** Label of the final submit button (e.g. "Pagar y confirmar" / "Radicar"). */
  readonly submitLabel?: string;
  readonly processingLabel?: string;
  /** BCP-47 locale for the built-in price formatting. Default `es-CO`. */
  readonly locale?: string;
  /** Fraction digits for the built-in price formatting. Default 0. */
  readonly fractionDigits?: number;
}

/** Template context handed to the per-step template. */
export interface CheckoutStepContext {
  readonly $implicit: CheckoutWizardStep;
  readonly index: number;
}

/** Emitted on a successful pay+confirm round. */
export interface CheckoutWizardResult {
  readonly reference: string;
  readonly vouchers: readonly FulfillmentVoucher[];
}

@Component({
  selector: 'syn-checkout-wizard',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-checkout-wizard' },
  styleUrl: './checkout-wizard.scss',
  template: `
    <div class="syn-wizard" [class.syn-wizard--no-summary]="!showSummary()">
      <div class="syn-wizard__main">
        <ol class="syn-wizard__steps" [attr.aria-label]="config().stepsLabel || 'Pasos'">
          @for (step of steps(); track step.id; let index = $index) {
            <li
              class="syn-wizard__step"
              [class.is-active]="index === stepIndex()"
              [class.is-done]="index < stepIndex()"
              [attr.aria-current]="index === stepIndex() ? 'step' : null"
            >
              {{ index + 1 }}. {{ step.label }}
            </li>
          }
        </ol>

        @if (currentStep(); as step) {
          <section class="syn-wizard__content" [attr.aria-label]="step.label">
            <ng-container
              [ngTemplateOutlet]="stepTemplate()"
              [ngTemplateOutletContext]="{ $implicit: step, index: stepIndex() }"
            />
          </section>
        }

        @if (errorMessage()) {
          <p class="syn-wizard__error" role="alert">{{ errorMessage() }}</p>
        }

        <div class="syn-wizard__actions">
          <button type="button" class="syn-wizard__btn" (click)="previous()">
            {{ config().backLabel || 'Atrás' }}
          </button>
          <button
            type="button"
            class="syn-wizard__btn syn-wizard__btn--primary"
            [disabled]="nextDisabled()"
            (click)="next()"
          >
            {{ nextLabel() }}
          </button>
        </div>
      </div>

      @if (showSummary()) {
        <aside class="syn-wizard__summary" [attr.aria-label]="config().summaryHeading || 'Resumen'">
          <h2 class="syn-wizard__summary-heading">{{ config().summaryHeading || 'Resumen' }}</h2>
          @if (items().length === 0) {
            <p class="syn-wizard__summary-empty">{{ config().emptyMessage || 'No hay artículos.' }}</p>
          } @else {
            <ul class="syn-wizard__lines">
              @for (item of items(); track item.id) {
                <li class="syn-wizard__line">
                  <span class="syn-wizard__line-label">{{ item.label }} × {{ item.quantity }}</span>
                  <span class="syn-wizard__line-amount">{{ lineTotalLabel(item) }}</span>
                </li>
              }
            </ul>
            <p class="syn-wizard__total">
              <span>{{ config().totalLabel || 'Total' }}</span>
              <span>{{ totalLabel() }}</span>
            </p>
          }
        </aside>
      }
    </div>
  `,
})
export class CheckoutWizardComponent {
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);

  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input.required<CheckoutWizardConfig>();
  /** One template renders every step; switch on `$implicit.id` inside it. */
  readonly stepTemplate = input.required<TemplateRef<CheckoutStepContext>>();
  /** Per-step gating: `stepId → can advance`. Missing entries default to valid. */
  readonly validity = input<Readonly<Record<string, boolean>>>({});
  /** Opaque payload handed to `IFulfillmentStrategy.pay` (PSP token, customer…). */
  readonly instrument = input<Readonly<Record<string, unknown>>>({});
  readonly showSummary = input(true);
  /** Override the built-in es-CO Intl price formatting (minor units in). */
  readonly priceFormatter = input<((minorUnits: number, currency: string) => string) | null>(null);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly stepchange = output<string>();
  readonly completed = output<CheckoutWizardResult>();
  readonly failed = output<string>();
  /** Emitted when the user backs out of the first step (e.g. back to cart). */
  readonly exit = output<void>();

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly steps = computed(() => this.config().steps);
  /** Resets to the first step whenever the configured steps change. */
  readonly stepIndex = linkedSignal(() => {
    this.steps();
    return 0;
  });
  readonly processing = signal(false);
  readonly errorMessage = signal('');

  readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? null);
  readonly isLastStep = computed(() => this.stepIndex() === this.steps().length - 1);

  // Engine-derived cart state.
  readonly items = this.#store.items;
  readonly pricing = this.#store.pricing;
  readonly hasItems = this.#store.hasItems;

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
    if (this.isLastStep()) {
      return !this.hasItems() || this.processing();
    }
    return false;
  });

  readonly nextLabel = computed(() => {
    if (this.processing()) {
      return this.config().processingLabel || 'Procesando…';
    }
    return this.isLastStep()
      ? this.config().submitLabel || 'Confirmar'
      : this.config().nextLabel || 'Continuar';
  });

  readonly totalLabel = computed(() =>
    this.formatMinor(this.pricing().totalAmount, this.pricing().currency),
  );

  // ─── Navigation ────────────────────────────────────────────────────────────
  next(): void {
    if (this.nextDisabled()) {
      return;
    }
    if (this.isLastStep()) {
      void this.submit();
      return;
    }
    this.stepIndex.set(this.stepIndex() + 1);
    this.errorMessage.set('');
    this.stepchange.emit(this.currentStep()?.id ?? '');
  }

  previous(): void {
    if (this.processing()) {
      return;
    }
    if (this.stepIndex() === 0) {
      this.exit.emit();
      return;
    }
    this.stepIndex.set(this.stepIndex() - 1);
    this.errorMessage.set('');
    this.stepchange.emit(this.currentStep()?.id ?? '');
  }

  // ─── Engine round: pay → record → confirm → vouchers ───────────────────────
  async submit(): Promise<void> {
    if (this.processing() || !this.hasItems()) {
      return;
    }
    this.processing.set(true);
    this.errorMessage.set('');
    this.#store.setStatus('paying');
    try {
      const session = this.#store.getValidSession();
      const instrument = this.instrument();
      const payResult = await this.#fulfillment.pay({ session, instrument });
      if (!payResult.accepted || !payResult.reference) {
        throw new Error(payResult.reason || 'payment-rejected');
      }

      const providerValue = instrument['provider'];
      const paid = this.#store.getValidSession();
      this.#store.setSession({
        ...paid,
        payments: [
          ...paid.payments,
          {
            id: `pay-${Date.now().toString(36)}`,
            amount: paid.pricing.totalAmount,
            provider: typeof providerValue === 'string' && providerValue !== '' ? providerValue : 'psp',
            status: 'captured' as const,
            reference: payResult.reference,
          },
        ],
        status: 'paying' as const,
      });

      const confirmation = await this.#fulfillment.confirm(this.#store.getValidSession());
      if (!confirmation.confirmed) {
        throw new Error(confirmation.reason || 'not-confirmed');
      }

      this.#store.setStatus('confirmed');
      this.completed.emit({ reference: payResult.reference, vouchers: confirmation.vouchers });
    } catch (error) {
      this.#store.setStatus('building');
      const reason = error instanceof Error ? error.message : 'unknown';
      this.errorMessage.set(reason);
      this.failed.emit(reason);
    } finally {
      this.processing.set(false);
    }
  }

  // ─── Formatting ────────────────────────────────────────────────────────────
  lineTotalLabel(item: SessionItem): string {
    return this.formatMinor(item.amount * item.quantity, this.pricing().currency);
  }

  private formatMinor(minorUnits: number, currency: string): string {
    const custom = this.priceFormatter();
    if (custom) {
      return custom(minorUnits, currency);
    }
    const amount = minorUnits / 100;
    const locale = this.config().locale || 'es-CO';
    const fractionDigits = this.config().fractionDigits ?? 0;
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'COP',
        maximumFractionDigits: fractionDigits,
      }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat(locale).format(amount)}`;
    }
  }
}
