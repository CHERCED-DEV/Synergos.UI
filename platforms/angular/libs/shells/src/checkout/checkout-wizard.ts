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
import { formatearImporte, desdeMenores } from '@synergos/vitals-core';

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

/**
 * Copy + behaviour config. Required: `steps` and the two failure messages.
 *
 * **Los dos mensajes de fallo son OBLIGATORIOS (UI#91).** El asistente no sabe qué hace
 * el `pay` de cada dominio: en la Tienda, Eventos, Viajes y Academia abre un cobro; en
 * Propiedades y EHR acuña una referencia LOCAL y no mueve dinero; en Booking APARTA la
 * habitación y el cobro es el `confirm`. Con un texto por defecto que presumía un cobro,
 * una cita que no se pudo reservar decía «Ya recibimos tu pago (referencia APPT-…)» —un
 * pago que nunca existió, con una referencia acuñada en el navegador— y una reserva cuyo
 * PAGO falló decía que el pago se había recibido. Medido en el spec de EHR. Y como cada
 * dominio lo «arreglaba» escribiendo su propio aviso encima, el lector de pantalla oía DOS
 * `role="alert"` que se contradecían. Lo dice quien sabe qué hace su `pay`: el dominio, y
 * en UN sitio: el aviso del asistente.
 */
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
  /**
   * Lo que se dice cuando el cobro NO salió. **Nada se cobró**, así que el mensaje
   * invita a reintentar sin más.
   */
  readonly payFailedMessage: string;
  /**
   * Lo que se dice cuando el cobro SÍ salió y la confirmación no. **Tiene que nombrar
   * lo que YA quedó**: decirle «no pudimos completar la compra» a quien acaba de
   * pagar le invita a pagar otra vez, y eso es daño propio, no «un botón de más».
   * `{referencia}` se sustituye por la referencia que devolvió el `pay`.
   */
  readonly confirmFailedMessage: string;
  /**
   * El aviso que escribe el DOMINIO a partir del motivo que devolvió su estrategia (el `code`
   * del rechazo) y de la referencia del cobro que quedó, si quedó alguno (ADR 0140 F4). Si
   * devuelve texto, ése es EL aviso —uno solo: un dominio que escribe su aviso encima del del
   * asistente crea dos `role="alert"` (regla 55)—; si devuelve `null`, quedan los dos de arriba.
   */
  readonly mensajeDeFallo?: (motivo: string, referenciaCapturada: string) => string | null;
  /** BCP-47 locale for the built-in price formatting. Default `es-CO`. */
  readonly locale?: string;
  /** Fraction digits for the built-in price formatting. Default 0. */
  readonly fractionDigits?: number;
}

/**
 * Los avisos de un `pay` que ABRE UN COBRO de verdad (la Tienda, Viajes, Eventos de pago):
 * en el primer fallo no se cobró nada; en el segundo el cobro quedó, y se nombra con su
 * referencia para que nadie pague dos veces (CMS#117). Un dominio cuyo `pay` NO cobra
 * —acuña una referencia local, o aparta— escribe los suyos: usar éstos ahí es decir «Ya
 * recibimos tu pago» de un pago que no existió (UI#91).
 */
export const AVISOS_DE_UN_COBRO = {
  payFailedMessage: 'No pudimos completar el cobro, así que no se te ha cobrado nada. Intenta de nuevo.',
  confirmFailedMessage:
    'Ya recibimos tu pago (referencia {referencia}) pero no pudimos confirmarlo. ' +
    'Vuelve a intentarlo: no se te cobrará de nuevo.',
} as const satisfies Pick<CheckoutWizardConfig, 'payFailedMessage' | 'confirmFailedMessage'>;

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

  /**
   * El cobro que el servidor YA se llevó para este carrito, si lo hay.
   *
   * **Sale de la SESIÓN y no de un campo de la instancia**: entre `pay` y `confirm`
   * la página puede recargarse y la sesión sobrevive, el campo no (regla 20). Se
   * exige además que el monto capturado siga siendo el total del carrito — si el
   * carrito cambió, ese cobro ya no lo cubre y hay que volver a cobrar.
   */
  readonly capturedReference = computed(() => {
    const session = this.#store.session();
    for (let index = session.payments.length - 1; index >= 0; index -= 1) {
      const payment = session.payments[index];
      if (payment.status !== 'captured' || !payment.reference) {
        continue;
      }
      return payment.amount === session.pricing.totalAmount ? payment.reference : '';
    }
    return '';
  });

  // ─── Engine round: pay → record → confirm → vouchers ───────────────────────
  /**
   * Una ronda del motor. **Un reintento no vuelve a cobrar** (CMS#117).
   *
   * Son dos pasos y el primero mueve dinero: si `pay` salió y `confirm` no, volver a
   * pulsar llamaba otra vez a `pay` —otra sesión de pago, otro cargo— y además
   * apilaba un segundo registro de pago sobre el mismo carrito. Hoy el cobro ya
   * capturado se reconoce en la sesión y sólo se reintenta la confirmación, que es
   * el paso que los bordes hacen idempotente justamente para esto.
   *
   * **Y el mensaje nombra lo que SÍ quedó**: «no pudimos completar la compra» a
   * secas, dicho a alguien a quien ya se le cobró, es una invitación a pagar dos
   * veces.
   */
  async submit(): Promise<void> {
    if (this.processing() || !this.hasItems()) {
      return;
    }
    this.processing.set(true);
    this.errorMessage.set('');
    this.#store.setStatus('paying');
    const alreadyPaid = this.capturedReference();
    try {
      let reference = alreadyPaid;
      if (!reference) {
        const session = this.#store.getValidSession();
        const instrument = this.instrument();
        const payResult = await this.#fulfillment.pay({ session, instrument });
        if (!payResult.accepted || !payResult.reference) {
          throw new Error(payResult.reason || 'payment-rejected');
        }
        reference = payResult.reference;

        const providerValue = instrument['provider'];
        const paid = this.#store.getValidSession();
        this.#store.setSession({
          ...paid,
          payments: [
            ...paid.payments,
            {
              id: `pay-${Date.now().toString(36)}`,
              amount: paid.pricing.totalAmount,
              provider:
                typeof providerValue === 'string' && providerValue !== '' ? providerValue : 'psp',
              status: 'captured' as const,
              reference,
            },
          ],
          status: 'paying' as const,
        });
      }

      // El mismo instrumento que `pay`, también en el reintento que sólo confirma: es por donde
      // el dominio le pasa a su estrategia lo que es de ESTE elemento (ADR 0140 F4).
      const confirmation = await this.#fulfillment.confirm(this.#store.getValidSession(), this.instrument());
      if (!confirmation.confirmed) {
        throw new Error(confirmation.reason || 'not-confirmed');
      }

      this.#store.setStatus('confirmed');
      this.completed.emit({ reference, vouchers: confirmation.vouchers });
    } catch (error) {
      this.#store.setStatus('building');
      const reason = error instanceof Error ? error.message : 'unknown';
      // Lo que decide el mensaje no es POR QUÉ falló: es si el servidor ya se llevó
      // el cobro. Se relee de la sesión porque este mismo intento pudo haberlo
      // dejado escrito antes de fallar al confirmar.
      this.errorMessage.set(this.failureMessage(reason, this.capturedReference()));
      this.failed.emit(reason);
    } finally {
      this.processing.set(false);
    }
  }

  /** El aviso de fallo: el que el dominio escribió para lo que QUEDÓ (ver la config). */
  private failureMessage(reason: string, capturedReference: string): string {
    const config = this.config();
    const delDominio = config.mensajeDeFallo?.(reason, capturedReference);
    if (delDominio) {
      return delDominio;
    }
    return capturedReference
      ? config.confirmFailedMessage.replaceAll('{referencia}', capturedReference)
      : config.payFailedMessage;
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
    return formatearImporte(desdeMenores(minorUnits, currency), currency, {
      locale: this.config().locale || undefined,
      decimales: this.config().fractionDigits ?? 0,
    });
  }
}
