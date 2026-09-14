import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { EhrApiClient, EhrUnavailableError } from './ehr-api.client';
import { EhrFulfillmentStrategy } from './ehr-fulfillment.strategy';
import { EhrElementComponent } from './ehr';
import { MARIA, VALENTINA, servidorFalso, type FakeServerOptions } from './ehr.server.fake';

/**
 * Specs del SPA clínico de dos portales — reescritos por
 * CHERCED-DEV/Synergos.CMS#106.
 *
 * **Lo que había antes**: los ocho specs stubeaban `fetch` para que rechazara siempre,
 * así que todos corrían por el camino degradado (incluido el llamado «happy case») y
 * **el único camino que se probaba era el que escondía el defecto**. `mockChart(id)`
 * aceptaba cualquier id y devolvía el paciente cero archivado bajo el id pedido; ningún
 * test podía verlo, porque no había una ficha de verdad con la que comparar.
 *
 * Ahora hay dos caminos y los dos se prueban: `servidorFalso()` sirve el contrato del
 * `EhrController`, y `caidos: [...]` apaga el endpoint que cada spec necesita ver caer
 * —que es lo que hace el backend real con `Synergos:DevSeed:Enabled=false`, donde los
 * 18 endpoints contestan 404—.
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

describe('EhrElementComponent (v2 dual portal)', () => {
  let fixture: ComponentFixture<EhrElementComponent>;
  let component: EhrElementComponent;

  /** Levanta el componente contra el servidor falso, ya apuntando a un paciente real. */
  async function createComponent(
    options: FakeServerOptions = {},
    patient: string = MARIA.id,
  ): Promise<void> {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    vi.stubGlobal('fetch', vi.fn(servidorFalso(options)));
    await TestBed.configureTestingModule({
      imports: [EhrElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        EhrApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: EhrFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EhrElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('patient', patient);
    fixture.detectChanges();
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ══ CAMINO NO DEGRADADO (el que antes no existía) ═══════════════════════════

  // ── empty: pristine patient home, no chart open ──────────────────────────────
  it('abre el home del paciente con los datos del SERVIDOR (empty/initial case)', async () => {
    await createComponent();

    expect(component.portal()).toBe('patient');
    expect(component.view()).toBe('home');
    expect(component.chart()).toBeNull();
    // El nombre viene del servidor falso, no de un seed del cliente: si alguien
    // reintrodujera un mock, este aserto seguiría verde — por eso está el bloque de
    // lecturas fallidas de más abajo, que es donde se ve la diferencia.
    expect(component.home()?.patient.name).toBe(MARIA.name);
    expect(component.readFailed('home')).toBe(false);
  });

  // ── happy: role-switch to clinician → open a chart → document a SOAP encounter ─
  it('abre la ficha del paciente PEDIDO y documenta un SOAP (happy case)', async () => {
    await createComponent();

    component.setRole('doctor');
    await flushMicrotasks();
    expect(component.portal()).toBe('clinician');
    expect(component.view()).toBe('board');
    expect(component.board().length).toBeGreaterThan(0);

    component.navigate('chart', VALENTINA.id);
    await flushMicrotasks();
    expect(component.view()).toBe('chart');
    // La ficha es la de Valentina, con SU diagnóstico — no el de la otra paciente.
    expect(component.chart()?.patient.name).toBe(VALENTINA.name);
    expect(component.chart()?.history[0].soap.assessment).toBe(VALENTINA.assessment);
    const before = component.chart()?.history.length ?? 0;

    component.startEncounter();
    expect(component.view()).toBe('encounter');
    component.soapSubjective.set('Refiere tos nocturna.');
    component.soapAssessment.set('Asma en control.');
    component.soapPlan.set('Continuar salbutamol.');
    component.vitalsSystolic.set('105');
    component.vitalsWeight.set('30');
    expect(component.soapValid()).toBe(true);

    await component.saveEncounter();
    await flushMicrotasks();

    expect(component.view()).toBe('chart');
    expect(component.chart()?.history.length).toBe(before + 1);
    expect(component.closedAvs()).not.toBe('');
  });

  // ── filter: searching patients narrows the clinician list ────────────────────
  it('filters the clinician patient list by query (filter case)', async () => {
    await createComponent();

    component.setRole('doctor');
    component.navigate('patients');
    await flushMicrotasks();
    const all = component.patients().length;
    expect(all).toBeGreaterThan(1);

    component.patientQuery.set('Valentina');
    component.submitPatientSearch();
    await flushMicrotasks();

    expect(component.patients().length).toBe(1);
    expect(component.patients()[0].name).toBe(VALENTINA.name);
  });

  // ── idempotent: requesting a refill twice keeps one "requested" state ─────────
  it('requests a refill optimistically and stays idempotent (idempotent case)', async () => {
    await createComponent();

    component.navigate('medications');
    await flushMicrotasks();
    const med = component.medications()[0];
    expect(med.drug).toBe(MARIA.drug);
    expect(med.refillStatus).toBeNull();

    component.requestRefill(med);
    const afterFirst = component.medications()[0].refillStatus;
    component.requestRefill(component.medications()[0]);
    await flushMicrotasks();

    expect(component.medications().length).toBe(1);
    expect(afterFirst).toBe('requested');
    expect(component.medications()[0].refillStatus).not.toBeNull();
  });

  // ── engine: scheduling a cita over SH-3 confirms and lands in "mis citas" ─────
  it('schedules an appointment through the engine and lands it in my visits (engine case)', async () => {
    await createComponent();

    component.navigate('schedule');
    await flushMicrotasks();
    component.setScheduleDoctor(component.doctors()[0]?.id ?? 'doc-mendez');
    component.scheduleReason.set('Control de hipertensión');
    component.selectSlot({ date: '2026-08-01', time: '10:00' });
    expect(component.scheduleValid()).toBe(true);

    const before = component.myAppointments().length;
    component.onScheduleCompleted({ reference: 'APPT-TEST', vouchers: [] });
    await flushMicrotasks();

    expect(component.myAppointments().length).toBe(before + 1);
    expect(component.view()).toBe('visits');
  });

  // ── reactive identity: patient input landing AFTER construction re-fetches ───
  // Pins the Angular Elements bug: the `patient` attr→input lands after the ctor, so
  // the effect must react to the resolved id and reload the current view.
  it('re-fetches the home feed when the patient input lands after construction', async () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    const fetchMock = vi.fn(servidorFalso());
    vi.stubGlobal('fetch', fetchMock);

    await TestBed.configureTestingModule({
      imports: [EhrElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        EhrApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: EhrFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EhrElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();
    // Primer tick: el default `P-1` no existe en el servidor → 404 → lectura fallida.
    expect(component.view()).toBe('home');
    expect(component.readFailed('home')).toBe(true);
    expect(component.home()).toBeNull();

    // The CMS mount sets `patient` AFTER construction (Angular Elements lifecycle).
    fixture.componentRef.setInput('patient', VALENTINA.id);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(component.patientId()).toBe(VALENTINA.id);
    expect(component.home()?.patient.name).toBe(VALENTINA.name);
    expect(component.readFailed('home')).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes(VALENTINA.id))).toBe(true);
  });

  // ── drug interaction flag against the patient's allergies ────────────────────
  it('flags a prescription item that clashes with a recorded allergy', async () => {
    await createComponent();

    component.setRole('doctor');
    component.navigate('chart', MARIA.id);
    await flushMicrotasks();
    component.startEncounter();

    component.rxDrug.set('Penicilina');
    component.rxDose.set('500 mg');
    component.addRxItem();

    expect(component.rxItems().length).toBe(1);
    expect(component.rxInteractions().length).toBeGreaterThan(0);
  });

  // ══ #106 · UNA LECTURA CLÍNICA QUE FALLA NO DEGRADA A OTRO PACIENTE ══════════

  it('la ficha que no se pudo leer queda VACÍA — no trae la historia de otro paciente', async () => {
    // El endpoint de ficha caído es exactamente el 404 de `[DevSeedOnly]` en producción.
    await createComponent({ caidos: ['/patient/'] });

    component.setRole('doctor');
    await flushMicrotasks();
    component.navigate('chart', VALENTINA.id);
    await flushMicrotasks();

    expect(component.chart()).toBeNull();
    expect(component.readFailed('chart')).toBe(true);

    // Y en pantalla: ni un dato clínico de nadie. El texto del paciente cero del mock
    // borrado era «Hipertensión grado 1, Diabetes tipo 2 de novo» bajo el nombre pedido.
    const host: HTMLElement = fixture.nativeElement;
    const texto = host.textContent ?? '';
    expect(texto).not.toContain(MARIA.name);
    expect(texto).not.toContain(MARIA.assessment);
    expect(texto).not.toContain(VALENTINA.assessment);
    expect(host.querySelector('.ehr__unreadable')).not.toBeNull();
    expect(texto).toContain('No pudimos abrir esta historia clínica');
  });

  it('el resumen de salud ilegible dice «no pudimos leer», nunca «sin alergias»', async () => {
    await createComponent({ caidos: ['/health'] });

    component.navigate('health');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.healthSummary()).toBeNull();
    expect(component.readFailed('health')).toBe(true);

    const texto = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('No pudimos leer tu resumen de salud');
    // Las dos frases que serían MENTIRA aquí: una lista de alergias que no se pudo
    // leer no es una persona sin alergias, y no es tampoco «todavía no hay nada».
    expect(texto).not.toContain('Sin alergias registradas');
    expect(texto).not.toContain('Sin resumen aún');
    // Y desde luego, nada del paciente cero.
    expect(texto).not.toContain('Penicilina');
  });

  it('el portal ilegible no rellena el nombre ni las alergias del paciente cero', async () => {
    await createComponent({ caidos: ['/portal/home'] }, VALENTINA.id);

    expect(component.home()).toBeNull();
    expect(component.readFailed('home')).toBe(true);

    const texto = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('No pudimos leer tu portal');
    expect(texto).not.toContain(MARIA.name);
    expect(texto).not.toContain('Hola, ');
  });

  it('las listas del paciente que no se pudieron leer no se leen como listas vacías', async () => {
    await createComponent({ caidos: ['/results', '/medications'] });

    component.navigate('results');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.results()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No pudimos leer tus resultados');
    expect(fixture.nativeElement.textContent).not.toContain('Sin resultados aún');

    component.navigate('medications');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.medications()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No pudimos leer tus medicamentos');
    expect(fixture.nativeElement.textContent).not.toContain('Sin medicamentos aún');
  });

  it('reintentar vuelve a pedir la lectura y la recupera cuando el servidor responde', async () => {
    await createComponent({ caidos: ['/health'] });
    component.navigate('health');
    await flushMicrotasks();
    expect(component.readFailed('health')).toBe(true);

    // El endpoint vuelve.
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    component.retryRead();
    await flushMicrotasks();

    expect(component.readFailed('health')).toBe(false);
    expect(component.healthSummary()?.allergies).toEqual(MARIA.allergies);
  });

  // ══ #106 · LA AUSENCIA SE PINTA COMO AUSENCIA ═══════════════════════════════

  it('sin clave `immunizations` no dice «sin vacunas», y con `[]` sí', async () => {
    // (a) El backend dejó de emitirla: no hay seam de vacunación.
    await createComponent();
    component.navigate('health');
    await flushMicrotasks();
    component.setHealthTab('immunizations');
    fixture.detectChanges();

    expect(component.healthSummary()?.immunizations).toBeNull();
    let texto = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('Sin registro de vacunación');
    expect(texto).toContain('no significa que estés al día');
    expect(texto).not.toContain('Sin vacunas registradas');

    // (b) Un backend que SÍ tuviera el registro y lo mandara vacío dice otra cosa —
    //     y ésa sí es una afirmación legítima sobre la persona.
    TestBed.resetTestingModule();
    await createComponent({ vacunas: 'empty' });
    component.navigate('health');
    await flushMicrotasks();
    component.setHealthTab('immunizations');
    fixture.detectChanges();

    expect(component.healthSummary()?.immunizations).toEqual([]);
    texto = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('Sin vacunas registradas');
    expect(texto).not.toContain('Sin registro de vacunación');
  });

  it('un cuidado preventivo sin estado NO se pinta «al día»', async () => {
    await createComponent();
    component.navigate('health');
    await flushMicrotasks();
    component.setHealthTab('maintenance');
    fixture.detectChanges();

    const item = component.healthSummary()?.maintenance[0];
    expect(item?.name).toBe('Control de presión arterial');
    // Ni `'due'` (que era el default del normalizador y suena a afirmación clínica)
    // ni `'complete'`: no consta.
    expect(item?.status).toBeNull();

    const texto = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('Sin registro');
    expect(texto).toContain('No tenemos registro de si ya te lo realizaste');
    expect(texto).not.toContain('Al día');
  });

  it('cuando el backend SÍ manda estado preventivo, se respeta', async () => {
    await createComponent({ estadoPreventivo: true });
    component.navigate('health');
    await flushMicrotasks();
    component.setHealthTab('maintenance');
    fixture.detectChanges();

    expect(component.healthSummary()?.maintenance[0].status).toBe('complete');
    expect(fixture.nativeElement.textContent).toContain('Al día');
  });

  // ── Molde de carga del portal (doc 24) ───────────────────────────────────────
  // La trampa: sustituir el `<p>Cargando tu portal…</p>` por un esqueleto deja la
  // pantalla más fina y al usuario ciego SIN saber que algo carga. El test exige las
  // dos mitades — huesos con la forma real de la rejilla Y el anuncio con texto.
  it('el portal carga con molde MUDO y un anuncio que SÍ se lee', async () => {
    await createComponent();

    // Volver al estado de carga: sin `home` y con `loading` encendido.
    component.view.set('home');
    component.home.set(null);
    component.loading.set(true);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;

    // 1. Forma real: título + subtítulo + una tarjeta por hueco de la rejilla, con
    //    las MISMAS clases (`ehr__cards`/`ehr__card`) que la rama con datos.
    const cards = component.homeSkeletons.length;
    expect(host.querySelectorAll('.ehr__bone--title').length).toBe(1);
    expect(host.querySelectorAll('.ehr__bone--sub').length).toBe(1);
    expect(host.querySelectorAll('.ehr__cards .ehr__card--skeleton').length).toBe(cards);
    expect(host.querySelectorAll('.ehr__bone--card-title').length).toBe(cards);

    // 2. Los huesos son decorativos.
    expect(host.querySelector('.ehr__bone--card-title')?.closest('[aria-hidden="true"]')).not.toBeNull();

    // 3. El aviso sigue vivo, con texto, fuera del aria-hidden.
    const status = Array.from(host.querySelectorAll('[role="status"]')).find((el) =>
      /Cargando tu portal/.test(el.textContent ?? ''),
    );
    expect(status).toBeDefined();
    expect(status!.closest('[aria-hidden="true"]')).toBeNull();

    // 4. Y sigue siendo PERCEPTIBLE por el lector. Este aserto existe porque una
    //    auditoría mutó el SCSS a `display: none` —la región queda en el DOM, con su
    //    rol y su texto— y las pruebas siguieron VERDES: el ciego se queda mudo con
    //    la pantalla idéntica y el tablero en verde. `display:none` y
    //    `visibility:hidden` SACAN el nodo del árbol de accesibilidad; el patrón de
    //    recorte (`clip-path`) no.
    const estilo = getComputedStyle(status!);
    expect(estilo.display).not.toBe('none');
    expect(estilo.visibility).not.toBe('hidden');
  });
});

describe('EhrApiClient (v2 endpoints)', () => {
  function createClient(): EhrApiClient {
    TestBed.configureTestingModule({ providers: [EhrApiClient] });
    return TestBed.inject(EhrApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live patients response (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    const client = createClient();
    const patients = await client.patients('/api/ehr', '');

    expect(patients).toHaveLength(2);
    expect(patients.map((p) => p.id)).toContain(MARIA.id);
  });

  it('una lectura clínica que falla LANZA — no devuelve datos de nadie', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    // Las doce lecturas, una por una: el barrido es el gate. Añadir una lectura nueva
    // con `catch → mock` sin añadirla aquí es exactamente cómo volvería el defecto.
    const lecturas: readonly [string, () => Promise<unknown>][] = [
      ['patients', () => client.patients('/api/ehr', '')],
      ['patientChart', () => client.patientChart('/api/ehr', MARIA.id)],
      ['doctors', () => client.doctors('/api/ehr')],
      ['appointments', () => client.appointments('/api/ehr', '2026-09-14')],
      ['portalHome', () => client.portalHome('/api/ehr', MARIA.id)],
      ['results', () => client.results('/api/ehr', MARIA.id)],
      ['medications', () => client.medications('/api/ehr', MARIA.id)],
      ['healthSummary', () => client.healthSummary('/api/ehr', MARIA.id)],
      ['billing', () => client.billing('/api/ehr', MARIA.id)],
      ['messages', () => client.messages('/api/ehr', MARIA.id)],
      ['inbox', () => client.inbox('/api/ehr', 'doctor')],
      ['schedule', () => client.schedule('/api/ehr', '2026-09-14')],
    ];

    for (const [nombre, lectura] of lecturas) {
      await expect(lectura(), nombre).rejects.toBeInstanceOf(EhrUnavailableError);
    }
  });

  it('la ficha de un paciente desconocido NO cae al paciente cero', async () => {
    // El caso exacto de #106: `mockChart('lo-que-sea')` devolvía `mockPatients()[0]`.
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    const client = createClient();

    await expect(client.patientChart('/api/ehr', 'pac-que-no-existe')).rejects.toBeInstanceOf(
      EhrUnavailableError,
    );
  });

  it('`immunizations` ausente es `null`, y `[]` es `[]`', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    let client = createClient();
    expect((await client.healthSummary('/api/ehr', MARIA.id)).immunizations).toBeNull();

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ vacunas: 'empty' })));
    client = createClient();
    expect((await client.healthSummary('/api/ehr', MARIA.id)).immunizations).toEqual([]);
  });

  it('un preventivo sin `status` se normaliza a `null`, no a «pendiente»', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    const client = createClient();
    const summary = await client.healthSummary('/api/ehr', MARIA.id);

    expect(summary.maintenance[0].status).toBeNull();
  });

  it('el tablero del día se normaliza sin `checkedInAhead` (ya no se emite)', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    const client = createClient();
    const board = await client.schedule('/api/ehr', '2026-09-14');

    expect(board.length).toBe(2);
    expect(Object.keys(board[0])).not.toContain('checkedInAhead');
  });
});
