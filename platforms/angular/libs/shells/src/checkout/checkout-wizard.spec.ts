import { Component, Injectable, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FULFILLMENT_STRATEGIES,
  FulfillmentStrategyBase,
  SessionStore,
  type FulfillmentConfirmation,
  type FulfillmentPayRequest,
  type FulfillmentPayResult,
  type FulfillmentProduct,
  type FulfillmentSearchQuery,
  type FulfillmentSelection,
  type SessionData,
  type SessionItem,
} from '@synergos/transaction-engine';
import {
  CheckoutWizardComponent,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
} from './checkout-wizard';

const FLOW = 'spec-flow';

/** Counting stub strategy — the "domain" the wizard must never know about. */
@Injectable()
class SpecStrategy extends FulfillmentStrategyBase {
  readonly id = FLOW;
  protected readonly flow = FLOW;
  payCalls = 0;
  confirmCalls = 0;
  acceptPay = true;

  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    void query;
    return [];
  }

  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    return { item: { ...(product.selection as unknown as SessionItem) } };
  }

  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    this.payCalls += 1;
    void request;
    return this.acceptPay
      ? { accepted: true, reference: `REF-${this.payCalls}` }
      : { accepted: false, reason: 'rejected-by-spec' };
  }

  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    this.confirmCalls += 1;
    return {
      confirmed: true,
      vouchers: session.items.map((item) => ({
        itemId: item.id,
        reference: `V-${item.id}`,
        status: 'confirmed',
      })),
    };
  }
}

const THREE_STEPS: CheckoutWizardConfig = {
  steps: [
    { id: 'datos', label: 'Datos' },
    { id: 'pago', label: 'Pago' },
    { id: 'revisar', label: 'Revisar' },
  ],
};

@Component({
  standalone: true,
  imports: [CheckoutWizardComponent],
  template: `
    <ng-template #step let-current>
      <p class="step-body" [attr.data-step]="current.id">contenido {{ current.id }}</p>
    </ng-template>
    <syn-checkout-wizard
      [config]="config()"
      [stepTemplate]="step"
      [validity]="validity()"
      [instrument]="{ provider: 'spec-psp' }"
      (stepchange)="stepLog.push($event)"
      (completed)="result = $event"
      (failed)="failure = $event"
      (exit)="exits = exits + 1"
    />
  `,
})
class HostComponent {
  readonly config = signal<CheckoutWizardConfig>(THREE_STEPS);
  readonly validity = signal<Readonly<Record<string, boolean>>>({});
  readonly stepLog: string[] = [];
  result: CheckoutWizardResult | null = null;
  failure = '';
  exits = 0;
}

function cartItem(id: string, amount = 10_000): SessionItem {
  return {
    id,
    kind: 'thing',
    productRef: `ref-${id}`,
    label: `Línea ${id}`,
    selection: {},
    amount,
    quantity: 1,
  };
}

async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe(CheckoutWizardComponent.name, () => {
  let strategy: SpecStrategy;
  let store: SessionStore;

  async function createHost() {
    localStorage.clear();
    strategy = new SpecStrategy();
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: FULFILLMENT_STRATEGIES, useValue: strategy, multi: true },
      ],
    }).compileComponents();

    store = TestBed.inject(SessionStore);
    store.init({ scope: 'wizard-spec', flow: FLOW });
    store.reset();

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function wizard(fixture: { nativeElement: HTMLElement }): {
    element: HTMLElement;
    nextBtn: HTMLButtonElement;
    backBtn: HTMLButtonElement;
  } {
    const element = fixture.nativeElement.querySelector('.syn-wizard') as HTMLElement;
    const buttons = element.querySelectorAll<HTMLButtonElement>('.syn-wizard__actions .syn-wizard__btn');
    return { element, nextBtn: buttons[1], backBtn: buttons[0] };
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty ───────────────────────────────────────────────────────────────────
  it('with an empty cart shows the empty summary and never submits (empty case)', async () => {
    const fixture = await createHost();
    const { element, nextBtn, backBtn } = wizard(fixture);

    expect(element.querySelector('.syn-wizard__summary-empty')).toBeTruthy();
    expect(element.querySelector('.step-body')?.getAttribute('data-step')).toBe('datos');

    // Walk to the last step: submit must be disabled with no items.
    nextBtn.click();
    fixture.detectChanges();
    wizard(fixture).nextBtn.click();
    fixture.detectChanges();
    expect(wizard(fixture).nextBtn.disabled).toBe(true);

    wizard(fixture).nextBtn.click();
    await flush();
    expect(strategy.payCalls).toBe(0);
    expect(fixture.componentInstance.result).toBeNull();

    // Backing out of the first step emits `exit`.
    backBtn.click();
    fixture.detectChanges();
    wizard(fixture).backBtn.click();
    fixture.detectChanges();
    wizard(fixture).backBtn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.exits).toBe(1);
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('walks the steps and runs pay → record payment → confirm on submit (happy case)', async () => {
    const fixture = await createHost();
    store.addItem(cartItem('a', 50_000));
    store.addItem(cartItem('b', 25_000));
    fixture.detectChanges();

    const host = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('.syn-wizard__line')).toHaveLength(2);

    wizard(fixture).nextBtn.click();
    fixture.detectChanges();
    expect(host.stepLog).toEqual(['pago']);

    wizard(fixture).nextBtn.click();
    fixture.detectChanges();
    expect(host.stepLog).toEqual(['pago', 'revisar']);

    wizard(fixture).nextBtn.click();
    await flush();
    fixture.detectChanges();

    expect(strategy.payCalls).toBe(1);
    expect(strategy.confirmCalls).toBe(1);
    expect(host.result?.reference).toBe('REF-1');
    expect(host.result?.vouchers).toHaveLength(2);
    expect(store.session().status).toBe('confirmed');
    // The generic payment record carries the instrument's provider.
    expect(store.session().payments.at(-1)?.provider).toBe('spec-psp');
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('omitting a step from config turns it off, and validity gates advancing (filter case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;

    // Pago OFF — only datos → revisar remain (pasos apagables por config).
    host.config.set({
      steps: [
        { id: 'datos', label: 'Datos' },
        { id: 'revisar', label: 'Revisar' },
      ],
    });
    fixture.detectChanges();

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.syn-wizard__step'),
    ).map((step) => step.textContent?.trim());
    expect(labels).toEqual(['1. Datos', '2. Revisar']);

    // Invalid current step blocks `next`.
    host.validity.set({ datos: false });
    fixture.detectChanges();
    expect(wizard(fixture).nextBtn.disabled).toBe(true);

    host.validity.set({ datos: true });
    fixture.detectChanges();
    wizard(fixture).nextBtn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.step-body')?.getAttribute('data-step')).toBe(
      'revisar',
    );
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('a second submit while processing or after failure does not double-pay (idempotent case)', async () => {
    const fixture = await createHost();
    store.addItem(cartItem('a'));
    fixture.detectChanges();

    // Jump to the last step.
    wizard(fixture).nextBtn.click();
    fixture.detectChanges();
    wizard(fixture).nextBtn.click();
    fixture.detectChanges();

    // Double-click the submit: the second click sees `processing` and no-ops.
    wizard(fixture).nextBtn.click();
    wizard(fixture).nextBtn.click();
    await flush();
    expect(strategy.payCalls).toBe(1);

    // A rejected pay reports failure and restores the building status.
    strategy.acceptPay = false;
    const fixture2Host = fixture.componentInstance;
    fixture2Host.result = null;
    store.setStatus('building');
    fixture.detectChanges();
    wizard(fixture).nextBtn.click();
    await flush();
    fixture.detectChanges();

    expect(fixture2Host.failure).toBe('rejected-by-spec');
    expect(store.session().status).toBe('building');
    expect(fixture.nativeElement.querySelector('.syn-wizard__error')?.textContent).toContain(
      'rejected-by-spec',
    );
  });
});
