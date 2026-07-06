import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { RealtyApiClient } from './realty-api.client';
import { RealtyFulfillmentStrategy } from './realty-fulfillment.strategy';
import { RealtyElementComponent } from './realty';
import { calculateMortgage } from './mortgage.calc';

/** Minimal in-memory localStorage stand-in so the SessionStore can persist. */
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

describe('RealtyElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<RealtyElementComponent>;
  let component: RealtyElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RealtyElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        RealtyApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: RealtyFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RealtyElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Initial search runs in the constructor; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine portal, search view, mock catalogue, no favorites ─────────
  it('opens on the SH-1 + SH-8 search with seeded listings and no favorites (empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('demand');
    expect(component.view()).toBe('search');
    expect(component.favoriteCount()).toBe(0);
    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.discoveryFacets().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: PDP → SH-3 visit wizard → confirm (NO payment) ─────────────────────
  it('runs the full visit lifecycle through the SH-3 wizard, pago OFF (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const first = component.listings()[0];
    component.openListing(first);
    await flushMicrotasks();
    expect(component.view()).toBe('pdp');

    component.startVisit();
    fixture.detectChanges();
    expect(component.view()).toBe('visit');

    component.selectSlot(component.availableSlots()[0]);
    component.visitName.set('Ada Lovelace');
    component.visitEmail.set('ada@example.com');
    component.visitPhone.set('3005551234');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    // mode → slot → contact → agendar → submit (pay OFF → confirm).
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    wizard.next(); // submit → pay (accepted no-op) → confirm (schedule visit, mock)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmedVisit()).not.toBeNull();
    expect(component.myVisits().length).toBe(1);
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── filter: SH-1 criteria filters the catalogue by property type ──────────────
  it('filters the catalogue by type through the discovery criteria (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.listings().length;
    component.onCriteriaChange({ term: '', facets: { type: ['casa'] }, sort: 'relevance', page: 1 });
    await flushMicrotasks();

    const after = component.listings();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((listing) => listing.type === 'casa')).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── favorites: toggling ♥ builds the shortlist ───────────────────────────────
  it('builds a favorites shortlist through the P11 toggle', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id);
    expect(component.favoriteCount()).toBe(1);
    expect(component.isFavorite(listing.id)).toBe(true);
    expect(component.favoriteListings().length).toBe(1);

    component.toggleFavorite(listing.id);
    expect(component.favoriteCount()).toBe(0);
  });

  // ── lead: contacting the agent lands a confirmation ──────────────────────────
  it('submits a lead to the agent and lands on the confirmation', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openListing(component.listings()[0]);
    await flushMicrotasks();
    component.openLead();
    component.leadName.set('Grace Hopper');
    component.leadEmail.set('grace@example.com');
    component.leadPhone.set('3009998877');
    component.leadMessage.set('Me interesa esta propiedad, más info por favor.');
    expect(component.leadValid()).toBe(true);

    component.submitLead();
    await flushMicrotasks();
    expect(component.view()).toBe('confirmation');
    expect(component.confirmedLeadId().length).toBeGreaterThan(0);
  });

  // ── agent console (SH-5): desk loads cartera + leads + agenda ─────────────────
  it('loads the SH-5 agent console with cartera, leads and agenda', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('agent');
    await flushMicrotasks();
    expect(component.desk()).not.toBeNull();
    expect(component.consoleKpis().length).toBeGreaterThan(0);
    expect(component.consoleRows().length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('/agente');

    component.onAgentSectionChange('leads');
    expect(component.agentView()).toBe('leads');
    expect(component.consoleColumns()).toBe(component.leadColumns);
  });

  // ── publish (SH-6): authoring wizard publishes a listing ─────────────────────
  it('publishes a listing through the SH-6 authoring wizard', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('agent');
    await flushMicrotasks();
    component.openPublish();
    expect(component.agentView()).toBe('publish');

    component.onPublishDraftChange({
      title: 'Apartamento de prueba',
      operation: 'sale',
      type: 'apartamento',
      city: 'Bogotá',
      neighborhood: 'Chapinero',
      price: '520000000',
      lat: '4.65',
      lng: '-74.06',
    });
    expect(component.publishValidity()['publicar']).toBe(true);

    component.onPublished(component.createDraft());
    await flushMicrotasks();
    expect(component.publishResultId().length).toBeGreaterThan(0);
  });

  // ── hash router: deep-links views + the agent console ─────────────────────────
  it('deep-links views and the agent console through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToMortgage();
    expect(window.location.hash).toBe('#/realty/hipoteca');

    component.setRole('agent');
    expect(window.location.hash).toContain('/agente');
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ─────────────
  it('degrades to a visible mock catalogue when the listings endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
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
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              listings: [
                {
                  id: 'X1',
                  title: 'Apto X',
                  operation: 'sale',
                  type: 'apartamento',
                  price: 500_000_000,
                  currency: 'COP',
                  geo: { lat: 4.6, lng: -74.0, city: 'Bogotá' },
                },
              ],
              total: 1,
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.listings(
      '/api/realty',
      { q: '', operation: 'sale', type: '', minPrice: 0, maxPrice: 0, beds: 0, location: '', sort: 'relevance' },
      'COP',
    );

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].id).toBe('X1');
    expect(client.degraded).toBe(false);
  });

  it('schedules a visit and degrades to a mock visit (no payment)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const visit = await client.scheduleVisit(
      '/api/realty',
      {
        listingId: 'L-1',
        slot: { date: '2026-07-10', time: '11:00' },
        contact: { name: 'Ada', email: 'a@b.co', phone: '3001112222' },
        mode: 'in-person',
      },
      'Apartamento en Chicó',
    );
    expect(client.degraded).toBe(true);
    expect(visit.status).toBe('confirmed');
    expect(visit.listingId).toBe('L-1');
  });

  it('degrades the agent desk + submits a lead that surfaces in the CRM', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const lead = await client.submitLead(
      '/api/realty',
      { listingId: 'L-1', contact: { name: 'Grace', email: 'g@b.co', phone: '3009998877' }, message: 'Hola' },
      'Apartamento en Chicó',
    );
    expect(lead.leadId.length).toBeGreaterThan(0);

    const desk = await client.agentDesk('/api/realty', 'agent');
    expect(client.degraded).toBe(true);
    expect(desk.portfolio.length).toBeGreaterThan(0);
    // The just-submitted lead is folded into the CRM.
    expect(desk.leads.some((entry) => entry.id === lead.leadId)).toBe(true);
  });

  it('publishes a listing that surfaces in the cartera (mock)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.publishListing(
      '/api/realty',
      {
        title: 'Nuevo Apto',
        operation: 'sale',
        type: 'apartamento',
        price: 400_000_000,
        city: 'Cali',
        neighborhood: 'Granada',
        address: 'Cl 1',
        lat: 3.45,
        lng: -76.53,
        beds: 2,
        baths: 2,
        areaBuilt: 70,
        stratum: 5,
      },
      'COP',
    );
    expect(result.id.length).toBeGreaterThan(0);

    const desk = await client.agentDesk('/api/realty', 'agent');
    expect(desk.portfolio.some((entry) => entry.id === result.id)).toBe(true);
  });
});

describe('calculateMortgage', () => {
  it('computes a fixed-rate monthly payment (French amortization)', () => {
    const result = calculateMortgage(
      { price: 500_000_000, downPayment: 150_000_000, termMonths: 240, annualRate: 12 },
      6,
    );
    expect(result.principal).toBe(350_000_000);
    expect(result.monthly).toBeGreaterThan(0);
    expect(result.totalPaid).toBeGreaterThan(result.principal);
    expect(result.schedule?.length).toBe(6);
  });

  it('degrades a 0% rate to straight-line and a fully-covered price to zero', () => {
    const zeroRate = calculateMortgage({ price: 120_000_000, downPayment: 0, termMonths: 12, annualRate: 0 });
    expect(zeroRate.monthly).toBe(10_000_000);
    expect(zeroRate.totalInterest).toBe(0);

    const covered = calculateMortgage({ price: 100_000_000, downPayment: 100_000_000, termMonths: 60, annualRate: 10 });
    expect(covered.monthly).toBe(0);
    expect(covered.principal).toBe(0);
  });
});
