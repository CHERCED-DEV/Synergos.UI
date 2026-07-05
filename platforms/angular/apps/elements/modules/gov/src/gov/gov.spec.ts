import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovApiClient } from './gov-api.client';
import { GovElementComponent } from './gov';
import { CASE_TRANSITIONS, canTransition, isTerminal } from './gov.model';

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

describe('GovElementComponent', () => {
  let fixture: ComponentFixture<GovElementComponent>;
  let component: GovElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [GovElementComponent],
      providers: [provideZonelessChangeDetection(), GovApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(GovElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Initial catalogue search runs in the constructor; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine portal, citizen face, seeded catalogue, no draft ──────────
  it('opens on the catalogue with seeded trámites and a clean draft (empty case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('citizen');
    expect(component.view()).toBe('catalog');
    expect(component.tramites().length).toBeGreaterThan(0);
    expect(component.docs().length).toBe(0);
    expect(component.confirmedCase()).toBeNull();
    expect(component.degraded()).toBe(true);
  });

  // ── happy: ficha → wizard data-driven → docs → check-answers → pagar → radicar ─
  it('radica una solicitud con tasa end-to-end hasta el radicado (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const pasaporte = component.tramites().find((t) => t.id === 'T-PASAPORTE');
    expect(pasaporte).toBeTruthy();
    component.openTramite(pasaporte!);
    await flushMicrotasks();
    expect(component.view()).toBe('detail');
    expect(component.hasFee()).toBe(true);

    component.startApplication();
    expect(component.view()).toBe('apply');
    expect(component.applyStep()).toBe('applicant');
    // Once-only: applicant llega prellenado y válido.
    expect(component.applicantName().length).toBeGreaterThan(0);
    expect(component.applicantValid()).toBe(true);

    component.nextStep();
    expect(component.applyStep()).toBe('form');
    expect(component.formValid()).toBe(false);
    component.setAnswer('tipoPasaporte', 'ordinario');
    component.setAnswer('fechaNacimiento', '1990-04-12');
    component.setAnswer('ciudadExpedicion', 'bogota');
    expect(component.formValid()).toBe(true);

    component.nextStep();
    expect(component.applyStep()).toBe('documents');
    // El trámite exige documentos → no se puede continuar sin adjuntar.
    expect(component.documentsValid()).toBe(false);
    component.onDropzoneFiles(
      new CustomEvent('filesaccepted', {
        detail: { accepted: [{ name: 'cedula.pdf', size: 120000 }] },
      }),
    );
    expect(component.docs().length).toBe(1);
    expect(component.documentsValid()).toBe(true);

    component.nextStep();
    expect(component.applyStep()).toBe('review');
    // Con tasa: el paso de pago existe y el envío está bloqueado hasta pagar.
    expect(component.applySteps()).toContain('payment');
    expect(component.canSubmit()).toBe(false);

    component.nextStep();
    expect(component.applyStep()).toBe('payment');
    component.payFee();
    expect(component.paid()).toBe(true);
    expect(component.canSubmit()).toBe(true);

    component.submitApplication();
    await flushMicrotasks();

    expect(component.view()).toBe('receipt');
    const kase = component.confirmedCase();
    expect(kase).not.toBeNull();
    expect(kase?.radicado).toMatch(/^GOV-2026-/);
    expect(kase?.status).toBe('radicado');
    expect(kase?.documents.length).toBe(1);

    // El radicado queda en mi carpeta.
    component.goToFolder();
    await flushMicrotasks();
    expect(component.myCases().some((entry) => entry.caseId === kase?.caseId)).toBe(true);
  });

  // ── happy (gratuito): sin tasa no existe el paso de pago ──────────────────────
  it('un trámite gratuito radica directo sin paso de pago', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const gratuito = component.tramites().find((t) => t.id === 'T-ANTECEDENTES');
    component.openTramite(gratuito!);
    await flushMicrotasks();
    expect(component.hasFee()).toBe(false);

    component.startApplication();
    expect(component.applySteps()).not.toContain('payment');

    component.nextStep(); // → form
    component.setAnswer('motivoConsulta', 'laboral');
    component.setAnswer('aceptaTratamiento', 'true');
    component.nextStep(); // → documents (sin requisitos → válido vacío)
    expect(component.documentsValid()).toBe(true);
    component.nextStep(); // → review
    expect(component.applyStep()).toBe('review');
    expect(component.canSubmit()).toBe(true);

    component.submitApplication();
    await flushMicrotasks();
    expect(component.view()).toBe('receipt');
    expect(component.confirmedCase()?.fee.amount).toBe(0);
  });

  // ── filter: búsqueda + categoría sobre el catálogo ────────────────────────────
  it('filtra el catálogo por texto y por categoría (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const all = component.total();
    expect(all).toBeGreaterThan(1);

    component.setCategory('identidad');
    await flushMicrotasks();
    expect(component.tramites().length).toBeGreaterThan(0);
    expect(component.tramites().every((t) => t.category === 'identidad')).toBe(true);

    component.searchTerm.set('pasaporte');
    component.submitSearch();
    await flushMicrotasks();
    expect(component.tramites().length).toBe(1);
    expect(component.tramites()[0].id).toBe('T-PASAPORTE');

    component.clearSearch();
    await flushMicrotasks();
    expect(component.total()).toBe(all);
  });

  // ── data-driven: el wizard renderiza los campos de la formDefinition ──────────
  it('renderiza el formulario desde la formDefinition del trámite (data-driven)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    // Trámite A: select + date + select.
    component.openTramite(component.tramites().find((t) => t.id === 'T-PASAPORTE')!);
    await flushMicrotasks();
    let fields = component.formFields();
    expect(fields.map((f) => f.key)).toEqual([
      'tipoPasaporte',
      'fechaNacimiento',
      'ciudadExpedicion',
    ]);
    expect(fields[0].type).toBe('select');
    expect(fields[0].options.length).toBeGreaterThan(0);
    expect(fields[1].type).toBe('date');

    // Trámite B: OTRA definición → OTROS campos, sin tocar código del módulo.
    component.backToCatalog();
    await flushMicrotasks();
    component.openTramite(component.tramites().find((t) => t.id === 'T-SISBEN')!);
    await flushMicrotasks();
    fields = component.formFields();
    expect(fields.map((f) => f.key)).toEqual(['personasHogar', 'cambioReportado']);
    expect(fields[0].type).toBe('number');
    expect(fields[1].type).toBe('textarea');

    // check-answers muestra el label de la opción, no el value crudo.
    component.startApplication();
    component.setAnswer('personasHogar', '4');
    expect(component.answerLabel(fields[0])).toBe('4');
  });

  // ── transición: role-switch + máquina de estados legal del expediente ─────────
  it('el funcionario avanza el expediente solo por transiciones legales', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('officer');
    await flushMicrotasks();
    expect(component.view()).toBe('queue');
    expect(component.queueCases().length).toBeGreaterThan(0);

    // Expediente sembrado en 'radicado' → única transición legal: en-revision.
    const radicado = component.queueCases().find((kase) => kase.status === 'radicado');
    expect(radicado).toBeTruthy();
    component.openCase(radicado!.caseId);
    await flushMicrotasks();
    expect(component.view()).toBe('officer-case');
    expect(component.nextStatuses()).toEqual(['en-revision']);

    // Ilegal: saltar directo a resuelto — se ignora.
    component.transitionCase('resuelto');
    await flushMicrotasks();
    expect(component.activeCase()?.status).toBe('radicado');

    // Legal: pasar a revisión.
    component.officerNote.set('Documentación completa.');
    component.transitionCase('en-revision');
    await flushMicrotasks();
    expect(component.activeCase()?.status).toBe('en-revision');
    expect(component.nextStatuses()).toEqual(['subsanacion', 'resuelto', 'rechazado']);

    // Legal: aprobar → terminal, sin más acciones.
    component.transitionCase('resuelto');
    await flushMicrotasks();
    expect(component.activeCase()?.status).toBe('resuelto');
    expect(component.nextStatuses()).toEqual([]);
    expect(component.isClosed('resuelto')).toBe(true);
  });

  // ── idempotent: repetir la misma transición no duplica historial ──────────────
  it('re-transicionar al mismo estado es un no-op (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('officer');
    await flushMicrotasks();
    const enRevision = component.queueCases().find((kase) => kase.status === 'en-revision');
    component.openCase(enRevision!.caseId);
    await flushMicrotasks();

    const before = component.activeCase()!.timeline.length;

    // Repetir el estado actual es ilegal (no está en CASE_TRANSITIONS) → no-op.
    component.transitionCase('en-revision');
    await flushMicrotasks();
    component.transitionCase('en-revision');
    await flushMicrotasks();

    expect(component.activeCase()?.status).toBe('en-revision');
    expect(component.activeCase()?.timeline.length).toBe(before);
  });

  // ── subsanación: ciclo bidireccional ciudadano ⇄ funcionario ──────────────────
  it('el ciudadano responde la subsanación y el expediente vuelve a revisión', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToFolder();
    await flushMicrotasks();
    const pendiente = component.myCases().find((kase) => kase.status === 'subsanacion');
    expect(pendiente).toBeTruthy();

    component.openCase(pendiente!.caseId);
    await flushMicrotasks();
    expect(component.view()).toBe('case');

    // Sin respuesta escrita no se envía.
    component.respondSubsanacion();
    await flushMicrotasks();
    expect(component.activeCase()?.status).toBe('subsanacion');

    component.subsanacionNote.set('Adjunto el recibo de la nueva vivienda.');
    component.respondSubsanacion();
    await flushMicrotasks();

    const updated = component.activeCase();
    expect(updated?.status).toBe('en-revision');
    const last = updated?.timeline[updated.timeline.length - 1];
    expect(last?.note).toContain('Respuesta del ciudadano');
  });
});

describe('case state machine (model)', () => {
  it('declares the legal lifecycle as data', () => {
    expect(CASE_TRANSITIONS['radicado']).toEqual(['en-revision']);
    expect(CASE_TRANSITIONS['en-revision']).toEqual(['subsanacion', 'resuelto', 'rechazado']);
    expect(CASE_TRANSITIONS['subsanacion']).toEqual(['en-revision']);
    expect(CASE_TRANSITIONS['resuelto']).toEqual([]);
    expect(CASE_TRANSITIONS['rechazado']).toEqual([]);
  });

  it('rejects illegal and self transitions', () => {
    expect(canTransition('radicado', 'resuelto')).toBe(false);
    expect(canTransition('radicado', 'radicado')).toBe(false);
    expect(canTransition('resuelto', 'en-revision')).toBe(false);
    expect(canTransition('en-revision', 'subsanacion')).toBe(true);
    expect(canTransition('subsanacion', 'en-revision')).toBe(true);
  });

  it('marks resolved/rejected as terminal', () => {
    expect(isTerminal('resuelto')).toBe(true);
    expect(isTerminal('rechazado')).toBe(true);
    expect(isTerminal('en-revision')).toBe(false);
  });
});

describe('GovApiClient', () => {
  function createClient(): GovApiClient {
    TestBed.configureTestingModule({ providers: [GovApiClient] });
    return TestBed.inject(GovApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live tramites response (happy case)', async () => {
    const liveTramite = {
      id: 'X1',
      name: 'Registro de marca',
      entity: 'SIC',
      category: 'empresa',
      channel: 'en-linea',
      summary: 'Proteja el nombre de su negocio.',
      estimatedDays: 20,
      feeAmount: 1000000,
      currency: 'COP',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tramites: [liveTramite], total: 1 }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.tramites('/api/gov', '', '');

    expect(result.tramites).toHaveLength(1);
    expect(result.tramites[0].id).toBe('X1');
    expect(result.tramites[0].category).toBe('empresa');
    expect(client.degraded).toBe(false);
  });

  it('filters the seeded catalogue by category when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.tramites('/api/gov', '', 'vehiculos');

    expect(client.degraded).toBe(true);
    expect(result.tramites.length).toBeGreaterThan(0);
    expect(result.tramites.every((t) => t.category === 'vehiculos')).toBe(true);
  });

  it('creates a mock expediente with radicado + first timeline entry (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.submitApplication('/api/gov', {
      tramiteId: 'T-SISBEN',
      applicant: {
        name: 'Ada Lovelace',
        docType: 'CC',
        docNumber: '12345678',
        email: 'ada@example.com',
        phone: '3000000000',
      },
      answers: { personasHogar: '2' },
      paid: false,
    });

    expect(result.radicado).toMatch(/^GOV-2026-/);
    const detail = await client.getCase('/api/gov', result.caseId);
    expect(detail.case.status).toBe('radicado');
    expect(detail.timeline).toHaveLength(1);
    expect(detail.timeline[0].status).toBe('radicado');
  });

  it('rejects an illegal transition as a no-op on the mock store (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    // Seeded CASE-SEED-4 está en 'radicado'.
    const first = await client.transition('/api/gov', 'CASE-SEED-4', 'resuelto', '', 'Test');
    expect(first.status).toBe('radicado');

    const legal = await client.transition('/api/gov', 'CASE-SEED-4', 'en-revision', 'ok', 'Test');
    expect(legal.status).toBe('en-revision');

    // Repetirla es no-op: mismo estado, sin entrada duplicada en el historial.
    const repeat = await client.transition('/api/gov', 'CASE-SEED-4', 'en-revision', 'ok', 'Test');
    expect(repeat.status).toBe('en-revision');
    const detail = await client.getCase('/api/gov', 'CASE-SEED-4');
    expect(detail.timeline.filter((entry) => entry.status === 'en-revision')).toHaveLength(1);
  });

  it('scopes the inbox by role: citizen sees own cases, officer sees the queue', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const citizen = await client.inbox('/api/gov', 'CC-52841903', 'citizen');
    const officer = await client.inbox('/api/gov', 'OF-1', 'officer');

    expect(citizen.length).toBeGreaterThan(0);
    expect(citizen.every((kase) => kase.applicant.docNumber === '52841903')).toBe(true);
    expect(officer.length).toBeGreaterThan(citizen.length - 1);
    expect(officer.some((kase) => kase.applicant.docNumber !== '52841903')).toBe(true);
  });
});
