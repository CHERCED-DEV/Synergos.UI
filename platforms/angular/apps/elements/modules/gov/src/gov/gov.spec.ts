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

  // ── reactive identity: an input landing AFTER construction re-fetches ─────────
  // Guardaba la lección con `citizen`, que murió con T2 (la identidad ya no la pone el
  // cliente). La lección NO murió: en Angular Elements los inputs aterrizan después del
  // constructor, así que se afirma con `apiBase`, que sigue siendo componible.
  it('re-fetches when the apiBase input lands after construction', async () => {
    // El backend solo "existe" en la base que manda el CMS; la default cae a mock.
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/gov-live/applications')) {
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
    expect(component.degraded()).toBe(true); // /api/gov default → offline → mock

    // The CMS mount sets `apiBase` AFTER construction (Angular Elements lifecycle).
    fixture.componentRef.setInput('apiBase', '/api/gov-live');
    fixture.detectChanges();
    await flushMicrotasks();

    expect(component.applications().some((a) => a.reference === 'GOV-2026-77777')).toBe(true);
    expect(component.degraded()).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/gov-live'))).toBe(true);
  });

  // ── T2: sin sesión el 401 NO se degrada a datos de ejemplo ────────────────────
  // El bug que cierra: el 401 caía en el catch genérico → markDegraded → la carpeta se
  // llenaba con las solicitudes sembradas. Un anónimo veía expedientes ajenos con un
  // cartelito de "datos de ejemplo".
  it('pide iniciar sesión cuando el backend responde 401 (no degrada a mock)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/applications')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }),
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
    expect(component.unauthenticated()).toBe(true);
    // Lo que importa: NADA de solicitudes sembradas, y sin cartel de "datos de ejemplo".
    expect(component.applications()).toEqual([]);
    expect(component.errorMessage()).toBe('');
    // El enlace vuelve a esta misma página tras el login.
    expect(component.loginUrl()).toContain('/account/login?returnUrl=');
  });

  // ── T2: la identidad ya no viaja en la URL ────────────────────────────────────
  it('nunca manda ?citizen= al pedir la carpeta', async () => {
    const fetchMock = vi.fn((url: string) => {
      void url;
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

    const applicationCalls = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes('/applications'));
    expect(applicationCalls.length).toBeGreaterThan(0); // control: se pidió de verdad
    expect(applicationCalls.every((u) => !u.includes('citizen'))).toBe(true);
  });

  // ── T2 (review): un 401 en el DETALLE rebota a la carpeta y la deja honesta ────
  // Bug de la revisión: loadApplication en 401 iba a 'applications' pero NO limpiaba la
  // lista → el badge del nav seguía mostrando el conteo viejo mientras el cuerpo pedía
  // iniciar sesión. Deep-link a un expediente con sesión expirada.
  it('un 401 al abrir un expediente rebota a la carpeta y limpia el badge', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/application/')) {
        return Promise.resolve({
          ok: false, status: 401,
          json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.location.hash = '#/gov/solicitud/app-cualquiera';
    }

    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();

    // Aterriza en la carpeta (única vista que pinta el panel), no en el detalle.
    expect(component.view()).toBe('applications');
    expect(component.unauthenticated()).toBe(true);
    expect(component.activeApplication()).toBeNull();
    // Badge honesto: nada de conteo viejo mientras se pide iniciar sesión.
    expect(component.applications()).toEqual([]);
  });

  // ── T2 (review): un 401 al SUBIR documento no falla en silencio ───────────────
  // Bug de la revisión: la vista de detalle no pinta el panel de login y el aviso solo
  // iba a la región sr-only → para un vidente la subida fallaba sin señal. Ahora rebota.
  it('un 401 al subir documento rebota a la carpeta (no falla en silencio)', async () => {
    const detail = {
      id: 'app-1', reference: 'GOV-2026-11111', serviceId: 'svc-x', serviceName: 'Trámite',
      status: 'in-review', submittedAt: '2026-07-05T10:00:00Z', currentStage: 'En revisión',
      timeline: [], documents: [], messages: [],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/document') && init?.method === 'POST') {
        return Promise.resolve({
          ok: false, status: 401,
          json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }),
        } as Response);
      }
      if (url.includes('/application/')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ application: detail }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.location.hash = '#/gov/solicitud/app-1';
    }

    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();

    // Control: el detalle cargó con sesión (200).
    expect(component.view()).toBe('application');
    expect(component.activeApplication()?.id).toBe('app-1');

    // La sesión "expira": subir un documento devuelve 401.
    component.uploadName.set('cedula.pdf');
    component.uploadDocument();
    await flushMicrotasks();

    // No se queda en el detalle en silencio: rebota al panel "Inicie sesión".
    expect(component.unauthenticated()).toBe(true);
    expect(component.view()).toBe('applications');
    expect(component.uploadName()).toBe('');
  });

  // ── T2 (review): el banner "datos de ejemplo" NO convive con "Inicie sesión" ──
  it('no muestra el banner de datos de ejemplo estando sin sesión', async () => {
    // service/{id} → 404 real (degrada a mock, prende el latch); applications → 401.
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/service/')) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      }
      if (url.includes('/applications')) {
        return Promise.resolve({
          ok: false, status: 401, json: () => Promise.resolve({ error: 'x' }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
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

    // Un trámite inexistente prende el latch `degraded`.
    component.openService({ id: 'no-existe', name: 'x', summary: '', category: '', agency: '',
      estimatedDays: 0, feeMinor: 0, currency: 'COP' });
    await flushMicrotasks();
    expect(component.degraded()).toBe(true);

    // Ahora la carpeta: 401 → unauthenticated. El banner se apaga aunque degraded siga true.
    component.goToApplications();
    await flushMicrotasks();
    expect(component.unauthenticated()).toBe(true);

    const notice = (fixture.nativeElement as HTMLElement).querySelector('.gov__notice');
    expect(notice).toBeNull();
  });

  // ── T2 (RBAC funcionario): la cola sin rol NO se degrada a mock ───────────────
  // El bug que cierra: queue/case/decision eran anónimas. Un visitante pulsaba
  // "Funcionario" y veía la cola con la PII de otros ciudadanos (cédula/correo).
  async function bootOfficer(status: 401 | 403): Promise<void> {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/queue') || url.includes('/case/')) {
        return Promise.resolve({
          ok: false, status,
          json: () => Promise.resolve({ error: 'x' }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.location.hash = '#/gov/gestion'; // ruta de la cola del funcionario
    }

    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('role', 'officer');
    fixture.detectChanges();
    await flushMicrotasks();
  }

  it('un 401 en la cola del funcionario pide iniciar sesión (no mock)', async () => {
    await bootOfficer(401);

    expect(component.view()).toBe('queue');
    expect(component.officerAccess()).toBe('anon');
    // Lo que importa: NINGÚN caso sembrado con PII a la vista.
    expect(component.queueCases()).toEqual([]);
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.signin__title');
    expect(panel?.textContent).toContain('Inicie sesión como funcionario');
  });

  it('un 403 en la cola del funcionario dice "no autorizado" (no login, no mock)', async () => {
    await bootOfficer(403);

    expect(component.view()).toBe('queue');
    expect(component.officerAccess()).toBe('forbidden');
    expect(component.queueCases()).toEqual([]);
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.signin__title');
    expect(panel?.textContent).toContain('no tiene permiso de funcionario');
    // 403: iniciar sesión NO ayuda → no se ofrece el enlace de login.
    const loginLink = (fixture.nativeElement as HTMLElement).querySelector('.signin a');
    expect(loginLink).toBeNull();
  });

  // ── T2 (live-caught): "Ir al portal ciudadano" NO puede ser un botón muerto ───
  // Deep-link a #/gov/gestion con el rol POR DEFECTO (citizen, el toggle nunca se pulsó):
  // la vista es la cola pero role()==='citizen', así que setRole('citizen') haría early-return
  // y el botón quedaría muerto en el panel. goToCitizenPortal navega igual.
  it('sale del panel del funcionario aunque el rol ya sea citizen (deep-link)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/queue')) {
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'x' }) } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.location.hash = '#/gov/gestion'; // deep-link a la cola SIN pulsar "Funcionario"
    }

    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();

    // Control: estamos en la cola con el panel, pero el rol nunca dejó de ser 'citizen'.
    expect(component.view()).toBe('queue');
    expect(component.role()).toBe('citizen');
    expect(component.officerAccess()).toBe('anon');

    // El botón del panel: navega al catálogo de verdad (no es un no-op).
    component.goToCitizenPortal();
    await flushMicrotasks();
    expect(component.view()).toBe('catalog');
    expect(component.officerAccess()).toBe('ok');
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
