import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovApiClient, isGovForbidden } from './gov-api.client';
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
    // `LiveAnnouncerService` cuelga su región de <body>, que es estado GLOBAL del jsdom y
    // sobrevive al reset del TestBed: sin esto, `lastLiveRegion()` leería la región del test
    // anterior y el fallo aparecería donde no está la causa.
    document.querySelectorAll('[data-syn-live-announcer]').forEach((node) => node.remove());
  });

  /** La región aria-live COMPARTIDA (`@synergos/shared`), o null si nadie la creó. */
  function lastLiveRegion(): HTMLElement | null {
    const regions = document.querySelectorAll<HTMLElement>('[data-syn-live-announcer]');
    return regions.length ? regions[regions.length - 1] : null;
  }

  /** El servicio escribe el mensaje 100 ms después de limpiar; hay que dejarlo llegar. */
  async function settleAnnouncer(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

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

  // ── El <h1> del hero se COMPONE desde el CMS, no está baked ───────────────────
  // El defecto que cierra: el emitter fusiona TODOS los props en UN atributo
  // `config='{...}'` (DefaultSynHostEmitter), y `sanitizeConfig` RECONSTRUYE el objeto
  // clave por clave — toda clave ausente del whitelist DESAPARECE en silencio, sin error
  // ni warning. El título del editor se descartaba y la app pintaba un <h1> hardcodeado,
  // violando el principio rector nº1 ("componer, nunca hardcodear").
  // Por eso el test entra por el MISMO camino que el mount del CMS (config como STRING
  // JSON) y afirma sobre el DOM renderizado: un test que solo mirase el input() flat
  // pasaría en verde con el whitelist roto.
  it('compone el heading y el subheading del hero desde el config del CMS', async () => {
    await createComponent();
    expect(component.view()).toBe('catalog');

    // Antes de que el CMS mande nada: los defaults = el texto que estaba baked.
    expect(component.heading()).toBe('¿Qué trámite necesita hacer?');
    expect(component.subheading()).toBe(
      'Busque por nombre, entidad o palabra clave. Sin filas ni papeleo.',
    );

    // El mount del CMS llega SIEMPRE por el JSON de `config`, después de construir.
    fixture.componentRef.setInput(
      'config',
      JSON.stringify({ heading: 'X', subheading: 'Y' }),
    );
    fixture.detectChanges();
    await flushMicrotasks();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.catalog__title')?.textContent?.trim()).toBe('X');
    expect(host.querySelector('.catalog__lead')?.textContent?.trim()).toBe('Y');
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
    component.uploadFile.set(new File(['x'], 'cedula.pdf', { type: 'application/pdf' }));
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
  async function bootOfficer(status: 401 | 403): Promise<ReturnType<typeof vi.fn>> {
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
    return fetchMock;
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

  // ── WCAG 2.4.3: el panel de acceso RECIBE el foco ─────────────────────────────
  // El bug que cierran: el markup ya traía `tabindex="-1"` + `#signinPanel`, pero ningún
  // .ts consumía la ref (`grep ViewChild|viewChild|signinPanel` en los .ts daba CERO), así
  // que el foco no se movía: media solución, conductualmente inerte. El 401 destruye el
  // control enfocado al navegar, el foco cae a <body> y el usuario de teclado tiene que
  // tabular la página entera para llegar al "Iniciar sesión" que se le acaba de ofrecer.
  it('un 401 en la cola mueve el foco al CONTENEDOR del panel, no al botón de login', async () => {
    await bootOfficer(401);
    fixture.detectChanges();
    await flushMicrotasks();

    const panel = (fixture.nativeElement as HTMLElement).querySelector('.signin');
    expect(panel).not.toBeNull(); // control: el panel se pintó de verdad
    // El CONTENEDOR: enfocándolo, el lector lee el título y el porqué ANTES que las
    // acciones. Por eso el markup es `tabindex="-1"` y no `0`.
    expect(document.activeElement).toBe(panel);
    const loginLink = (fixture.nativeElement as HTMLElement).querySelector('.signin a');
    expect(loginLink).not.toBeNull(); // control: sí había un botón al que enfocar por error
    expect(document.activeElement).not.toBe(loginLink);
  });

  it('el 403 del funcionario también enfoca el panel (no solo el 401)', async () => {
    await bootOfficer(403);
    fixture.detectChanges();
    await flushMicrotasks();

    const panel = (fixture.nativeElement as HTMLElement).querySelector('.signin');
    expect(panel).not.toBeNull();
    expect(document.activeElement).toBe(panel);
  });

  // El foco se mueve SOLO cuando la negativa viene de una acción del usuario, NUNCA por el
  // mero hecho de que el panel aparezca. `handleCitizenDenied` deja `applicationsLoaded` en
  // true, así que salir de la carpeta y volver NO dispara fetch ni negativa nueva: solo
  // destruye el panel y lo vuelve a pintar. Si el `.focus()` colgara de esa aparición, cada
  // ida y vuelta del usuario por el nav le arrancaría el foco.
  it('volver a un panel ya denegado NO vuelve a robar el foco', async () => {
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
    fixture.detectChanges();
    await flushMicrotasks();

    const firstPanel = (fixture.nativeElement as HTMLElement).querySelector('.signin');
    expect(firstPanel).not.toBeNull();
    expect(document.activeElement).toBe(firstPanel); // control: la 1.ª negativa sí enfocó

    /** Solo las llamadas a la carpeta: el catálogo sí puede refetchear, y da igual. */
    const folderCalls = (): number =>
      fetchMock.mock.calls.filter(([u]) => String(u).includes('/applications')).length;
    const callsAfterDenial = folderCalls();

    // El usuario se va al catálogo y vuelve a su carpeta por su propio pie.
    component.navigate('catalog');
    await flushMicrotasks();
    fixture.detectChanges();
    component.navigate('applications');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    // control: fue navegación pura — la carpeta no se volvió a pedir, luego no hubo negativa.
    expect(folderCalls()).toBe(callsAfterDenial);
    const secondPanel = (fixture.nativeElement as HTMLElement).querySelector('.signin');
    expect(secondPanel).not.toBeNull();
    expect(secondPanel).not.toBe(firstPanel); // control: el panel se re-creó de verdad
    // Y aun así el foco NO saltó al panel nuevo.
    expect(document.activeElement).not.toBe(secondPanel);
  });

  // ── GOV-BL-A11Y-05: el MISMO mensaje se vuelve a anunciar ─────────────────────
  // `announce()` era `this.announcement.set(message)`. Las señales comparan con `Object.is`,
  // así que repetir el mismo string no notificaba → el DOM no cambiaba → el lector callaba.
  it('re-anuncia el MISMO mensaje cuando llega una segunda negativa idéntica', async () => {
    const fetchMock = await bootOfficer(401);
    fixture.detectChanges();
    await settleAnnouncer();

    const region = lastLiveRegion();
    expect(region).not.toBeNull(); // control: se usa la región compartida, no un signal
    expect(region?.textContent).toContain('Inicie sesión como funcionario');

    // Se marca el nodo: si el segundo aviso NO se escribe, la marca sobrevive — que es
    // exactamente lo que pasaba con la señal.
    region!.textContent = '((no se re-anunció))';
    const callsBefore = fetchMock.mock.calls.length;

    // Segunda negativa IDÉNTICA: filtrar la cola la vuelve a pedir y vuelve a dar 401 con
    // el mismo texto.
    component.onConsoleFilterChange('assigned');
    await flushMicrotasks();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore); // control: se pidió
    expect(component.officerAccess()).toBe('anon');

    await settleAnnouncer();
    expect(lastLiveRegion()?.textContent).toContain('Inicie sesión como funcionario');
  });

  // ── T6: el FICHERO viaja de verdad (multipart), no solo su nombre ────────────
  // El bug que cierra: la UI leía files[0].name, soltaba el File y mandaba JSON. El
  // ciudadano adjuntaba su cédula, el API decía "accepted" y no existía nada.
  it('sube el documento como multipart con los BYTES, no un JSON con el nombre', async () => {
    const detail = {
      id: 'app-1', reference: 'GOV-2026-11111', serviceId: 'svc-x', serviceName: 'Trámite',
      status: 'in-review', submittedAt: '2026-07-05T10:00:00Z', currentStage: 'En revisión',
      timeline: [], documents: [], messages: [],
    };
    let uploadInit: RequestInit | undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/document') && init?.method === 'POST') {
        uploadInit = init;
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({
            document: {
              id: 'doc_1', name: 'cedula.pdf', status: 'accepted',
              uploadedAt: '2026-07-05T11:00:00Z', contentType: 'application/pdf',
              sizeBytes: 5, downloadUrl: '/api/gov/document/app-1/doc_1',
            },
          }),
        } as Response);
      }
      if (url.includes('/application/')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ application: detail }),
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
    expect(component.view()).toBe('application'); // control: el detalle cargó

    component.uploadFile.set(new File(['%PDF-'], 'cedula.pdf', { type: 'application/pdf' }));
    component.uploadName.set('cedula.pdf');
    component.uploadDocument();
    await flushMicrotasks();

    // LO QUE T6 CIERRA: el cuerpo es un FormData con el fichero dentro, no JSON.
    expect(uploadInit?.body).toBeInstanceOf(FormData);
    const sent = uploadInit!.body as FormData;
    const sentFile = sent.get('file');
    expect(sentFile).toBeInstanceOf(File);
    expect((sentFile as File).name).toBe('cedula.pdf');
    expect(sent.get('applicationId')).toBe('app-1');
    // El Content-Type lo pone el navegador con su boundary: fijarlo rompe el multipart.
    const headers = (uploadInit?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();

    // El adjunto entra al detalle con su enlace de descarga.
    const doc = component.activeApplication()!.documents.at(-1)!;
    expect(doc.downloadUrl).toBe('/api/gov/document/app-1/doc_1');
    expect(component.uploadFile()).toBeNull(); // se limpió tras subir
  });

  it('sin fichero elegido no intenta subir nada', async () => {
    await createComponent();

    component.uploadName.set('solo-un-nombre.pdf'); // nombre sin File
    component.uploadDocument();
    await flushMicrotasks();

    // No debe haber salido ninguna petición de subida: el nombre suelto ya no basta.
    expect(component.uploadFile()).toBeNull();
  });

  it('solo ofrece descarga cuando hay binario detrás', async () => {
    await createComponent();

    // Documento de T6 (con fichero) vs documento previo (metadata sin fichero).
    expect(component.documentSizeLabel(2048)).toBe('2 KB');
    expect(component.documentSizeLabel(undefined)).toBe('');
    expect(component.documentSizeLabel(0)).toBe('');
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

    // Control: estamos en la cola con el panel de acceso denegado.
    expect(component.view()).toBe('queue');
    expect(component.officerAccess()).toBe('anon');

    // La precondición EXACTA del bug: el rol ya es 'citizen' (el toggle nunca se pulsó),
    // así que un `setRole('citizen')` haría early-return y el botón quedaría muerto.
    component.role.set('citizen');

    // El botón del panel: navega al catálogo de verdad (no es un no-op).
    component.goToCitizenPortal();
    await flushMicrotasks();
    expect(component.view()).toBe('catalog');
    expect(component.officerAccess()).toBe('ok');
  });

  // ── Barrido IDOR: un 403 de expediente AJENO no pinta el expediente de otro ────
  // El bug más grave del lado ciudadano: `application(id)` degradaba a mock en el catch y,
  // como el id ajeno NO está en el store local, caía en `?? [...values()][0]` → devolvía EL
  // PRIMER expediente sembrado, rotulado con el id que se pidió. No era "mostrar datos de
  // ejemplo": era fabricar un registro inexistente y presentarlo como el solicitado, justo
  // a quien el servidor acababa de negarle el acceso.
  it('un 403 al abrir un expediente ajeno vuelve al listado y NO pinta otro expediente', async () => {
    const mios = [
      {
        id: 'app-mio', reference: 'GOV-2026-77777', serviceId: 'svc-x', serviceName: 'Mi trámite',
        status: 'in-review', submittedAt: '2026-07-05T10:00:00Z', currentStage: 'En revisión',
      },
    ];
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/application/')) {
        return Promise.resolve({
          ok: false, status: 403,
          json: () => Promise.resolve({ error: 'Esa solicitud no es suya.' }),
        } as Response);
      }
      if (url.includes('/applications')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ applications: mios }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.location.hash = '#/gov/solicitud/app-de-otro';
    }

    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();

    // LO QUE CIERRA EL BUG: ningún expediente pintado bajo el id ajeno.
    expect(component.activeApplication()).toBeNull();
    expect(component.view()).toBe('applications');
    // No se le pide iniciar sesión: YA tiene sesión, el expediente simplemente no es suyo.
    expect(component.unauthenticated()).toBe(false);
    expect(component.citizenAccess()).toBe('ok');
    expect(component.accessNotice()).toContain('no es suya');
    // Y su carpeta REAL sí se muestra: eso sí es suyo, y lo dice el servidor.
    expect(component.applications().map((app) => app.id)).toEqual(['app-mio']);
  });

  // ── Barrido IDOR: 403 al adjuntar a un expediente ajeno ───────────────────────
  it('un 403 al subir documento saca del detalle y suelta el fichero', async () => {
    const detail = {
      id: 'app-1', reference: 'GOV-2026-11111', serviceId: 'svc-x', serviceName: 'Trámite',
      status: 'in-review', submittedAt: '2026-07-05T10:00:00Z', currentStage: 'En revisión',
      timeline: [], documents: [], messages: [],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/document') && init?.method === 'POST') {
        return Promise.resolve({
          ok: false, status: 403, json: () => Promise.resolve({ error: 'No es suyo.' }),
        } as Response);
      }
      if (url.includes('/application/')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ application: detail }),
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

    // Control: el detalle cargó (200) antes de intentar adjuntar.
    expect(component.activeApplication()?.id).toBe('app-1');

    component.uploadFile.set(new File(['x'], 'cedula.pdf', { type: 'application/pdf' }));
    component.uploadName.set('cedula.pdf');
    component.uploadDocument();
    await flushMicrotasks();

    // Sale del detalle con el aviso — sin pedir login (la sesión es válida).
    expect(component.view()).toBe('applications');
    expect(component.activeApplication()).toBeNull();
    expect(component.unauthenticated()).toBe(false);
    expect(component.uploadName()).toBe('');
    expect(component.uploadFile()).toBeNull();
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

  // ── Barrido IDOR (cliente): el 403 se re-lanza, no se degrada ────────────────
  it('un 403 en application(id) re-lanza en vez de devolver el expediente de otro', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 403, json: () => Promise.resolve({ error: 'No es suyo.' }),
    } as Response)));
    const client = createClient();

    const error = await client.application('/api/gov', 'app-de-otro').then(() => null, (e) => e);
    // Se discrimina por `name` (el guard real), no por `instanceof`: esa es la garantía
    // que sobrevive a que la clase se duplique en otro bundle.
    expect(isGovForbidden(error)).toBe(true);
    // Y NO se encendió el latch de "datos de ejemplo": un 403 no es una caída del backend.
    expect(client.degraded).toBe(false);
  });

  // Control del MISMO fabricador sin auth de por medio: offline, un id desconocido ya no
  // sirve el primer expediente del store rotulado con el id pedido.
  it('offline, un id desconocido falla en vez de devolver el primer expediente', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    await expect(client.application('/api/gov', 'no-existe-en-ningun-lado')).rejects.toThrow();
    // Control opuesto: un id SÍ sembrado sigue resolviendo offline (la demo no se rompió).
    const seeded = await client.application('/api/gov', 'app-seed-4');
    expect(seeded.id).toBe('app-seed-4');
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

  // Regresión del hallazgo BLOQUEANTE de la auditoría de la ola "un 401/403 no se
  // disfraza de datos": `mockDecide` tenía un `?? [...mockStore().values()][0]`, así que
  // si el POST de la decisión caía, devolvía el PRIMER caso sembrado. En pantalla: el
  // funcionario aprueba, la UI anuncia éxito, la decisión no se registra en ninguna
  // parte, y queda abierto el expediente de OTRO ciudadano con su nombre y sus
  // documentos. Fingir una escritura que no ocurrió es peor que no escribir.
  it('does NOT fabricate a decision on a different case when the id is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    await expect(
      client.decide('/api/gov', {
        caseId: 'CASE-REAL-DEL-BACKEND-9999',
        outcome: 'approve',
        note: 'Aprobado.',
      }),
    ).rejects.toThrow();
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
