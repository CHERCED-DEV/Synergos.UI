import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovApiClient } from './gov-api.client';
import { GovElementComponent } from './gov';
import { OUTCOME_TO_STATUS, isClosedStatus } from './gov.model';

/**
 * Smoke tests (directiva: tests solo smoke) for the Gobierno v2 dual-face SPA.
 * The 4 canonical shapes (empty / happy / filter / idempotent) over the offline
 * (mock-degraded) graph, plus the api-client degradation + reactive-identity
 * contracts.
 *
 * fetch rejection is a macrotask in jsdom, so we yield to real timers between
 * microtask drains to let each fetch().then() hop resolve.
 */
async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('GovElementComponent (v2 dual face)', () => {
  let fixture: ComponentFixture<GovElementComponent>;
  let component: GovElementComponent;

  async function createComponent(): Promise<void> {
    // Offline → seeded demo data across both faces.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine portal, citizen face, seeded catalogue, no active state ───
  it('opens on the catalogue with seeded services (empty case)', async () => {
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('citizen');
    expect(component.view()).toBe('catalog');
    expect(component.services().length).toBeGreaterThan(0);
    expect(component.confirmedApplication()).toBeNull();
    expect(component.activeApplication()).toBeNull();
    expect(component.degraded()).toBe(true);
  });

  // ── happy: discovery → ficha → SH-9 form radica → receipt → mis solicitudes ───
  it('opens a service, radica the SH-9 form and lands the receipt (happy case)', async () => {
    await createComponent();

    const service = component.services().find((s) => s.id === 'svc-antecedentes');
    expect(service).toBeTruthy();
    component.openService(service!);
    await flushMicrotasks();
    expect(component.view()).toBe('service');
    expect(component.service()?.id).toBe('svc-antecedentes');

    component.startApplication();
    await flushMicrotasks();
    expect(component.view()).toBe('apply');
    // The SH-9 schema came from the contract form endpoint (mock).
    expect(component.formSchema().sections.length).toBeGreaterThan(0);

    // Radicar directly through the SH-9 submit output (shell owns validation).
    component.onFormSubmit({ answers: { motivoConsulta: 'laboral', aceptaTratamiento: 'true' } });
    await flushMicrotasks();

    expect(component.view()).toBe('receipt');
    const app = component.confirmedApplication();
    expect(app).not.toBeNull();
    expect(app?.reference).toMatch(/^GOV-2026-/);
    expect(app?.status).toBe('submitted');

    // The new application shows up in "mis solicitudes".
    component.goToApplications();
    await flushMicrotasks();
    expect(component.applications().some((a) => a.id === app?.id)).toBe(true);
  });

  // ── filter: officer queue narrows by status (contract ?status=) ───────────────
  it('switches to the officer queue and filters by status (filter case)', async () => {
    await createComponent();

    component.setRole('officer');
    await flushMicrotasks();
    expect(component.role()).toBe('officer');
    expect(component.view()).toBe('queue');
    const all = component.queueCases().length;
    expect(all).toBeGreaterThan(0);

    component.onConsoleFilterChange('approved');
    await flushMicrotasks();
    expect(component.queueCases().length).toBeGreaterThan(0);
    expect(component.queueCases().every((c) => c.status === 'approved')).toBe(true);
    expect(component.queueCases().length).toBeLessThanOrEqual(all);
  });

  // ── happy (officer): open a case → decide → status advances + queue refetch ───
  it('opens a case and records an approve decision (officer happy case)', async () => {
    await createComponent();

    component.setRole('officer');
    await flushMicrotasks();
    const pending = component.queueCases().find((c) => c.status === 'submitted');
    expect(pending).toBeTruthy();

    component.openCase(pending!.id);
    await flushMicrotasks();
    expect(component.view()).toBe('case');
    expect(component.activeCase()?.application.id).toBe(pending!.id);
    expect(component.caseOutcomes().length).toBeGreaterThan(0);

    component.decisionNote.set('Documentación completa.');
    component.decide('approve');
    await flushMicrotasks();

    expect(component.activeCase()?.application.status).toBe('approved');
    expect(component.activeCase()?.decision?.outcome).toBe('approve');
    // Closed → no further decisions offered.
    expect(component.caseOutcomes()).toEqual([]);
  });

  // ── idempotent: deciding on a closed case is a no-op ──────────────────────────
  it('ignores a decision on an already-closed case (idempotent case)', async () => {
    await createComponent();

    component.setRole('officer');
    await flushMicrotasks();
    const closed = component.queueCases().find((c) => c.status === 'approved');
    expect(closed).toBeTruthy();

    component.openCase(closed!.id);
    await flushMicrotasks();
    const before = component.activeCase()?.application.status;
    expect(isClosedStatus(before!)).toBe(true);
    expect(component.caseOutcomes()).toEqual([]);

    // decide() must bail because the case is closed.
    component.decide('reject');
    await flushMicrotasks();
    expect(component.activeCase()?.application.status).toBe(before);
  });

  // ── reactive identity: citizen input landing AFTER construction re-fetches ────
  it('re-fetches when the citizen/agency input lands after construction', async () => {
    // Backend "alive" for the CMS-supplied citizen; the default 404s to mock.
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/applications') && url.includes('CC-99999999')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              applications: [
                {
                  id: 'app-live-1',
                  reference: 'GOV-2026-77777',
                  serviceName: 'Trámite en vivo',
                  status: 'in-review',
                  submittedAt: '2026-07-05T10:00:00Z',
                  currentStage: 'En revisión',
                },
              ],
            }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.location.hash = '#/gov/mis-solicitudes';
    }

    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();
    expect(component.view()).toBe('applications');
    expect(component.degraded()).toBe(true); // default CC-52841903 → mock

    // The CMS mount sets `citizen` AFTER construction (Angular Elements lifecycle).
    fixture.componentRef.setInput('citizen', 'CC-99999999');
    fixture.detectChanges();
    await flushMicrotasks();

    expect(component.citizen()).toBe('CC-99999999');
    expect(component.applications().some((a) => a.reference === 'GOV-2026-77777')).toBe(true);
    expect(component.degraded()).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('CC-99999999'))).toBe(true);
  });
});

describe('OUTCOME_TO_STATUS (model)', () => {
  it('maps each officer outcome to a status', () => {
    expect(OUTCOME_TO_STATUS.approve).toBe('approved');
    expect(OUTCOME_TO_STATUS.reject).toBe('rejected');
    expect(OUTCOME_TO_STATUS['request-info']).toBe('info-requested');
  });

  it('marks approved/rejected as closed', () => {
    expect(isClosedStatus('approved')).toBe(true);
    expect(isClosedStatus('rejected')).toBe(true);
    expect(isClosedStatus('in-review')).toBe(false);
    expect(isClosedStatus('info-requested')).toBe(false);
  });
});

describe('GovApiClient (v2 contract)', () => {
  function createClient(): GovApiClient {
    TestBed.configureTestingModule({ providers: [GovApiClient] });
    return TestBed.inject(GovApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live services response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              services: [
                {
                  id: 'svc-x',
                  name: 'Registro de marca',
                  summary: 'Proteja el nombre de su negocio.',
                  category: 'empresa',
                  agency: 'SIC',
                  estimatedDays: 20,
                  feeMinor: 100000000,
                  currency: 'COP',
                },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const services = await client.services('/api/gov', '', '');

    expect(services).toHaveLength(1);
    expect(services[0].id).toBe('svc-x');
    expect(services[0].feeMinor).toBe(100000000);
    expect(client.degraded).toBe(false);
  });

  it('filters the seeded catalogue by category when offline (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const services = await client.services('/api/gov', '', 'vehiculos');
    expect(client.degraded).toBe(true);
    expect(services.length).toBeGreaterThan(0);
    expect(services.every((s) => s.category === 'vehiculos')).toBe(true);
  });

  it('creates a mock application with a radicado on the exact contract (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const summary = await client.createApplication('/api/gov', {
      serviceId: 'svc-sisben',
      answers: { personasHogar: '3' },
    });
    expect(summary.reference).toMatch(/^GOV-2026-/);
    expect(summary.status).toBe('submitted');

    const detail = await client.application('/api/gov', summary.id);
    expect(detail.reference).toBe(summary.reference);
    expect(detail.timeline.length).toBeGreaterThan(0);
  });

  it('records a decision and advances the case status (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    // Seeded app-seed-4 is 'submitted'.
    const kase = await client.decide('/api/gov', {
      caseId: 'app-seed-4',
      outcome: 'request-info',
      note: 'Falta un documento.',
    });
    expect(kase.application.status).toBe('info-requested');
    expect(kase.decision?.outcome).toBe('request-info');
    // The officer note landed as an incoming correspondence entry for the citizen.
    const detail = await client.application('/api/gov', 'app-seed-4');
    expect(detail.status).toBe('info-requested');
  });

  it('scopes the queue by status when offline (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const approved = await client.queue('/api/gov', '', 'approved');
    expect(client.degraded).toBe(true);
    expect(approved.length).toBeGreaterThan(0);
    expect(approved.every((c) => c.status === 'approved')).toBe(true);
  });

  it('degrades a bad-shape services payload to seeded data (degradation case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ foo: 'bar' }) } as Response),
      ),
    );
    const client = createClient();

    const services = await client.services('/api/gov', '', '');
    expect(services.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });
});
