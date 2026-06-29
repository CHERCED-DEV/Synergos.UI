import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RealtyApiClient } from './realty-api.client';
import { RealtyElementComponent } from './realty';
import { calculateMortgage } from './mortgage.calc';
import type { Listing } from './realty.model';

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('RealtyElementComponent', () => {
  let fixture: ComponentFixture<RealtyElementComponent>;
  let component: RealtyElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RealtyElementComponent],
      providers: [provideZonelessChangeDetection(), RealtyApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(RealtyElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Initial search runs in the constructor; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine portal, no favorites, search view, mock catalogue ─────────
  it('opens on the search view with seeded listings and no favorites (empty case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('search');
    expect(component.favoriteCount()).toBe(0);
    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: open PDP → schedule a visit → confirmation (NO payment) ────────────
  it('runs the full visit lifecycle to a confirmation, no payment (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const first = component.listings()[0];
    component.openListing(first);
    await flushMicrotasks();
    expect(component.view()).toBe('pdp');
    expect(component.detail()).not.toBeNull();

    component.startVisit();
    expect(component.view()).toBe('visit');
    expect(component.visitStep()).toBe('mode');

    component.setVisitMode('video');
    component.nextVisitStep();
    expect(component.visitStep()).toBe('slot');

    const slot = component.availableSlots()[0];
    component.selectSlot(slot);
    expect(component.visitSlotValid()).toBe(true);
    component.nextVisitStep();
    expect(component.visitStep()).toBe('contact');

    component.visitName.set('Ada Lovelace');
    component.visitEmail.set('ada@example.com');
    component.visitPhone.set('3001234567');
    expect(component.visitContactValid()).toBe(true);
    component.nextVisitStep();
    expect(component.visitStep()).toBe('review');

    component.confirmVisit();
    await flushMicrotasks();

    expect(component.view()).toBe('confirmation');
    const visit = component.confirmedVisit();
    expect(visit).not.toBeNull();
    expect(component.myVisits().length).toBe(1);
    expect(visit?.mode).toBe('video');
  });

  // ── filter: operation switch returns only that operation's listings ───────────
  it('filters listings by operation and bedroom count (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setOperation('rent');
    await flushMicrotasks();
    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.listings().every((listing) => listing.operation === 'rent')).toBe(true);

    // Rapid consecutive filter clicks must coalesce (latest criteria wins), not drop.
    component.setOperation('sale');
    component.setBeds(3);
    await flushMicrotasks();
    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.listings().every((listing) => listing.specs.beds >= 3)).toBe(true);
  });

  // ── idempotent: toggling a favorite twice returns to the original state ────────
  it('toggling a favorite on then off keeps the shortlist stable (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const id = component.listings()[0].id;
    expect(component.isFavorite(id)).toBe(false);

    component.toggleFavorite(id);
    component.toggleFavorite(id);
    component.toggleFavorite(id);
    expect(component.isFavorite(id)).toBe(true);
    expect(component.favoriteCount()).toBe(1);

    component.toggleFavorite(id);
    expect(component.isFavorite(id)).toBe(false);
    expect(component.favoriteCount()).toBe(0);
  });

  // ── lead: contact agent generates a lead → confirmation ───────────────────────
  it('submits a lead to the agent and confirms it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openListing(component.listings()[0]);
    await flushMicrotasks();

    component.openLead();
    expect(component.leadOpen()).toBe(true);
    component.leadName.set('Carlos Ramírez');
    component.leadEmail.set('carlos@example.com');
    component.leadPhone.set('3019876543');
    component.leadMessage.set('Me interesa mucho esta propiedad.');
    expect(component.leadValid()).toBe(true);

    component.submitLead();
    await flushMicrotasks();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmedLeadId().length).toBeGreaterThan(0);
    expect(component.myLeads().length).toBe(1);
  });

  // ── mortgage: live client recompute when inputs change ────────────────────────
  it('recomputes the live mortgage when price/down/term/rate change', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setMortgagePrice(300_000_000);
    component.setMortgageDown(60_000_000);
    component.setMortgageTerm(240);
    component.setMortgageRate(12);

    const result = component.mortgageResult();
    expect(result.principal).toBe(240_000_000);
    expect(result.monthly).toBeGreaterThan(0);
    expect(result.schedule?.length).toBeGreaterThan(0);
  });
});

describe('calculateMortgage', () => {
  it('computes a fixed-rate monthly payment (happy case)', () => {
    const result = calculateMortgage({
      price: 200_000_000,
      downPayment: 40_000_000,
      termMonths: 120,
      annualRate: 12,
    });
    expect(result.principal).toBe(160_000_000);
    // 160M at 1%/month over 120 months ≈ 2.295M/month.
    expect(result.monthly).toBeGreaterThan(2_200_000);
    expect(result.monthly).toBeLessThan(2_400_000);
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it('degrades a 0% rate to straight-line principal / term (edge case)', () => {
    const result = calculateMortgage({
      price: 120_000_000,
      downPayment: 0,
      termMonths: 12,
      annualRate: 0,
    });
    expect(result.monthly).toBe(10_000_000);
    expect(result.totalInterest).toBe(0);
  });

  it('clamps a down payment above the price to zero principal (idempotent/guard case)', () => {
    const result = calculateMortgage({
      price: 100_000_000,
      downPayment: 150_000_000,
      termMonths: 60,
      annualRate: 10,
    });
    expect(result.principal).toBe(0);
    expect(result.monthly).toBe(0);
    expect(result.totalInterest).toBe(0);
  });

  it('produces an amortization schedule whose balance decreases to ~0', () => {
    const result = calculateMortgage(
      { price: 100_000_000, downPayment: 20_000_000, termMonths: 24, annualRate: 12 },
      24,
    );
    const schedule = result.schedule ?? [];
    expect(schedule.length).toBe(24);
    const last = schedule[schedule.length - 1];
    expect(last.balance).toBeLessThan(1);
  });
});

describe('RealtyApiClient', () => {
  function createClient(): RealtyApiClient {
    TestBed.configureTestingModule({ providers: [RealtyApiClient] });
    return TestBed.inject(RealtyApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live listings response (happy case)', async () => {
    const liveListing = {
      id: 'X1',
      title: 'Apto en Poblado',
      operation: 'sale',
      type: 'apartamento',
      price: 500_000_000,
      currency: 'COP',
      geo: { lat: 6.2, lng: -75.57, address: 'Cra 1', neighborhood: 'Poblado', city: 'Medellín' },
      specs: { beds: 2, baths: 2, areaBuilt: 70, stratum: 6 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ listings: [liveListing], total: 1, facets: [] }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.listings(
      '/api/realty',
      {
        q: '',
        operation: 'sale',
        type: '',
        minPrice: 0,
        maxPrice: 0,
        beds: 0,
        location: '',
        sort: 'relevance',
      },
      'COP',
    );

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].id).toBe('X1');
    expect(result.listings[0].geo.city).toBe('Medellín');
    expect(client.degraded).toBe(false);
  });

  it('filters the seeded catalogue by type when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.listings(
      '/api/realty',
      {
        q: '',
        operation: 'sale',
        type: 'casa',
        minPrice: 0,
        maxPrice: 0,
        beds: 0,
        location: '',
        sort: 'relevance',
      },
      'COP',
    );

    expect(client.degraded).toBe(true);
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.listings.every((listing: Listing) => listing.type === 'casa')).toBe(true);
  });

  it('schedules a visit offline with an optimistic confirmed fallback (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const visit = await client.scheduleVisit(
      '/api/realty',
      {
        listingId: 'L-1',
        slot: { date: '2026-07-01', time: '09:00' },
        contact: { name: 'Ada', email: 'a@b.co', phone: '3001234567' },
        mode: 'in-person',
      },
      'Apartamento en Chicó',
    );

    expect(client.degraded).toBe(true);
    expect(visit.status).toBe('confirmed');
    expect(visit.listingTitle).toBe('Apartamento en Chicó');
    expect(visit.slot.time).toBe('09:00');
  });

  it('falls back to the pure client calc when the mortgage endpoint is down (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();
    const body = { price: 200_000_000, downPayment: 40_000_000, termMonths: 120, annualRate: 12 };

    const a = await client.mortgage('/api/realty', body);
    const b = await client.mortgage('/api/realty', body);

    expect(client.degraded).toBe(true);
    expect(a.monthly).toBe(b.monthly);
    expect(a.principal).toBe(160_000_000);
  });
});
