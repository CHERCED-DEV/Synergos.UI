import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  BookingWizardElementComponent,
  type BookingOffer,
} from './booking-wizard';

/** Minimal in-memory localStorage stand-in for the session tests. */
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
  vi.stubGlobal('localStorage', mock);
  return store;
}

/** Build a fetch mock that resolves each call with the next queued JSON body. */
function queueFetch(responses: readonly unknown[]): ReturnType<typeof vi.fn> {
  let call = 0;
  const fetchMock = vi.fn(() => {
    const body = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Drain the microtask queue enough times to settle a fetch().then() chain. */
async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

const SAMPLE_OFFER: BookingOffer = {
  offerId: 'OFR-1',
  roomTypeName: 'Suite Vista al Mar',
  board: 'Desayuno incluido',
  totalPrice: 1_200_000,
  totalPriceFormatted: '$ 1.200.000',
  currency: 'COP',
  refundable: true,
  cancellationPolicy: 'Cancelación gratuita hasta 48h antes',
  roomsLeft: 3,
};

describe('BookingWizardElementComponent', () => {
  let fixture: ComponentFixture<BookingWizardElementComponent>;
  let component: BookingWizardElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BookingWizardElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingWizardElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── Case 1: render-search ──────────────────────────────────────────────────
  it('starts on the search step with a default room (render-search case)', async () => {
    installMemoryStorage();
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.step()).toBe('search');
    expect(component.stepIndex()).toBe(0);
    expect(component.rooms().length).toBe(1);
    expect(component.rooms()[0].adults).toBe(2);
    // No valid dates yet → cannot search.
    expect(component.canSearch()).toBe(false);
  });

  // ── Case 2: search-results-mock ────────────────────────────────────────────
  it('searches and renders offers from the mocked API (search-results-mock case)', async () => {
    installMemoryStorage();
    const fetchMock = queueFetch([{ offers: [SAMPLE_OFFER] }]);
    await createComponent();

    component.checkIn.set('2026-08-01');
    component.checkOut.set('2026-08-05');
    expect(component.datesValid()).toBe(true);
    expect(component.canSearch()).toBe(true);

    component.search();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/booking/search');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.checkIn).toBe('2026-08-01');
    expect(sent.checkOut).toBe('2026-08-05');
    expect(sent.rooms[0].adults).toBe(2);

    expect(component.step()).toBe('results');
    expect(component.hasOffers()).toBe(true);
    expect(component.offers()[0].roomTypeName).toBe('Suite Vista al Mar');
    expect(component.loading()).toBe(false);
  });

  // ── Case 3: step-nav ───────────────────────────────────────────────────────
  it('navigates forward through select/guest/pay and back (step-nav case)', async () => {
    installMemoryStorage();
    queueFetch([{ offers: [SAMPLE_OFFER] }]);
    await createComponent();

    // Pick an offer → guest step.
    component.selectOffer(SAMPLE_OFFER);
    expect(component.step()).toBe('guest');
    expect(component.selectedOffer()?.offerId).toBe('OFR-1');

    // Guest must be valid to continue.
    expect(component.guestValid()).toBe(false);
    component.continueToPay();
    expect(component.step()).toBe('guest');

    component.guestName.set('Ada Lovelace');
    component.guestEmail.set('ada@example.com');
    expect(component.guestValid()).toBe(true);
    component.continueToPay();
    expect(component.step()).toBe('pay');

    // Back walks one step at a time.
    component.back();
    expect(component.step()).toBe('guest');
    component.back();
    expect(component.step()).toBe('results');
  });

  // ── Case 4: session-rehydrate ──────────────────────────────────────────────
  it('rehydrates the wizard state from a persisted session (session-rehydrate case)', async () => {
    const store = installMemoryStorage();

    // First instance: drive it to the pay step, which persists the session.
    const fetchMock = queueFetch([{ offers: [SAMPLE_OFFER] }]);
    await createComponent();
    const firstKey = component.sessionKey();

    component.checkIn.set('2026-09-10');
    component.checkOut.set('2026-09-12');
    component.search();
    await flushMicrotasks();
    component.selectOffer(SAMPLE_OFFER);
    component.guestName.set('Grace Hopper');
    component.guestEmail.set('grace@example.com');
    component.continueToPay();
    expect(component.step()).toBe('pay');

    // Flush change detection so the persistence effect runs.
    fixture.detectChanges();
    await fixture.whenStable();

    // The effect persisted a session under the instance key.
    expect(store.has(firstKey)).toBe(true);

    // Second instance pinned to the SAME session key → must rehydrate.
    fetchMock.mockClear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [BookingWizardElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture2 = TestBed.createComponent(BookingWizardElementComponent);
    const component2 = fixture2.componentInstance;
    // Map the persisted "i1" key onto this instance via the sessionKey input.
    const persistedScope = firstKey.split('.').pop() as string;
    fixture2.componentRef.setInput('sessionKey', persistedScope);
    fixture2.detectChanges();

    expect(component2.sessionKey()).toBe(firstKey);
    expect(component2.checkIn()).toBe('2026-09-10');
    expect(component2.checkOut()).toBe('2026-09-12');
    expect(component2.selectedOffer()?.offerId).toBe('OFR-1');
    expect(component2.guestName()).toBe('Grace Hopper');
    expect(component2.step()).toBe('pay');
  });
});
