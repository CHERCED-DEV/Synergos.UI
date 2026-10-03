import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import {
  EhrAccesoDenegadoError,
  EhrApiClient,
  EhrUnavailableError,
  EhrWriteFailedError,
} from './ehr-api.client';
import { EhrFulfillmentStrategy } from './ehr-fulfillment.strategy';
import { EhrElementComponent } from './ehr';
import {
  ENFERMERIA,
  MARIA,
  SIN_HISTORIA,
  SOLO_PACIENTE,
  VALENTINA,
  servidorFalso,
  type FakeServerOptions,
} from './ehr.server.fake';
import { asentar } from '../../../../../../tools/asentar';
import { EHR_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: EHR_SYNHOST.ejemplo.apiBase };

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
  await asentar(times);
}

describe('EhrElementComponent (v2 dual portal)', () => {
  let fixture: ComponentFixture<EhrElementComponent>;
  let component: EhrElementComponent;

  /**
   * Levanta el componente contra el servidor falso. El paciente NO se le dice: lo pone la sesión
   * del servidor (`options.sesion`, CMS#197), como en producción.
   */
  async function createComponent(
    options: FakeServerOptions = {},
    config: object = NEGOCIO_DEL_CMS,
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
    fixture.componentRef.setInput('config', config);
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
  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('sin la base de la API no llama a nada y la lectura falla, visible (ADR 0137, CMS#196)', async () => {
    await createComponent({}, {});

    // Acá no hay muestra: una lectura clínica que no llegó se dice, no se inventa.
    expect(fetch).not.toHaveBeenCalled();
    expect(component.readFailed('home')).toBe(true);
  });

  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/resultados';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/resultados');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.view()).toBe('results');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    component.navigate('medications');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1/medicamentos');
  });

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

  // ── engine: agendar una cita RESERVA contra el borde ─────────────────────────
  //
  // Se pulsa el botón del asistente, no se llama a `onScheduleCompleted`: lo que
  // falló en #111 fue precisamente que `bookAppointment` **no tenía llamador** y un
  // spec que llame al método no ve eso (regla 5).
  async function agendarPorElAsistente(): Promise<void> {
    component.navigate('schedule');
    await flushMicrotasks();
    component.setScheduleDoctor(component.doctors()[0]?.id ?? 'doc-mendez');
    component.scheduleReason.set('Control de hipertensión');
    component.selectSlot({ date: '2026-08-01', time: '10:00' });
    fixture.detectChanges();
    expect(component.scheduleValid()).toBe(true);

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    wizard.next(); // submit → pay → confirm (= POST /appointment)
    await flushMicrotasks(30);
    fixture.detectChanges();
  }

  // ── #83: la modalidad la pinta `syn-segmented`, y el lector sabe cuál está elegida ──
  //
  // Antes eran dos <button> con sólo la clase `is-active`: la pantalla cambiaba de color
  // y un lector de pantalla no tenía nada que leer. Se busca por ROL y NOMBRE, no por
  // la clase, porque lo que se prueba es lo que recibe el lector.
  it('la modalidad es un radiogroup con estado y se cambia con el teclado (#83)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await createComponent();
    component.navigate('schedule');
    await flushMicrotasks();
    fixture.detectChanges();

    const group = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'syn-segmented.ehr__mode-toggle [role="radiogroup"]',
    );
    expect(group).not.toBeNull();
    // #87: el nombre es el rótulo VISIBLE «Modalidad», por aria-labelledby. Antes el rótulo no
    // se asociaba y el grupo llevaba otro texto aparte en aria-label.
    const rotulo = document.getElementById(group?.getAttribute('aria-labelledby') ?? '');
    expect(rotulo?.textContent?.trim()).toBe('Modalidad');
    expect((fixture.nativeElement as HTMLElement).contains(rotulo)).toBe(true);
    expect(group?.hasAttribute('aria-label')).toBe(false);
    const radios = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const estado = (): string[][] =>
      radios.map((radio) => [radio.textContent?.trim() ?? '', radio.getAttribute('aria-checked') ?? '']);
    expect(estado()).toEqual([
      ['Presencial', 'true'],
      ['Video', 'false'],
    ]);

    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(component.scheduleMode()).toBe('video');
    expect(estado()).toEqual([
      ['Presencial', 'false'],
      ['Video', 'true'],
    ]);
  });

  it('una modalidad que no está en la lista no llega a la cita (#83)', async () => {
    await createComponent();
    component.setScheduleMode('video');
    component.setScheduleMode('telepatía');
    expect(component.scheduleMode()).toBe('video');
  });

  it('agenda la cita CONTRA EL SERVIDOR y enseña el comprobante suyo (engine case)', async () => {
    const fetchMock = vi.fn(servidorFalso());
    await createComponent();
    vi.stubGlobal('fetch', fetchMock);

    const before = component.myAppointments().length;
    await agendarPorElAsistente();

    const reservas = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).includes('/appointment') &&
        ((init as RequestInit | undefined)?.method ?? 'GET') === 'POST',
    );
    expect(reservas.length).toBe(1);

    expect(component.myAppointments().length).toBe(before + 1);
    expect(component.view()).toBe('visits');
    // El id es el del BORDE. El `CITA-<timestamp>` que se acuñaba aquí no existía en
    // ningún sitio: el paciente lo anotaba y se presentaba a una hora libre.
    expect(component.myAppointments()[0].id).toBe('CITA-DEL-SERVIDOR-7');
    expect(component.confirmedAppointmentRef()).toBe('CITA-DEL-SERVIDOR-7');
  });

  // ══ #111 · UNA ESCRITURA QUE NO LLEGÓ NO SE CONFIRMA ════════════════════════
  //
  // El apagón que las alcanza es el PARCIAL: toda escritura va detrás de una lectura
  // que funcionó, así que con todo caído ninguna de estas ramas existe.

  it('la cita que NO se pudo reservar no aparece en «mis citas» ni da comprobante', async () => {
    await createComponent();
    // Lecturas vivas, sólo la reserva caída. `'POST /appointment'` y no
    // `'/appointment'`: lo segundo apagaría también la agenda que se lee.
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ caidos: ['POST /appointment'] })));

    const before = component.myAppointments().length;
    await agendarPorElAsistente();

    expect(component.myAppointments().length).toBe(before);
    expect(component.confirmedAppointmentRef()).toBe('');
    expect(component.view()).toBe('schedule');
    // UNA alerta, y dice que la cita no quedó. Medido antes de UI#91: dos —la de la ficha y
    // la del asistente—, y la del asistente decía «Ya recibimos tu pago (referencia
    // APPT-…)», un pago que no existió con una referencia acuñada en el navegador.
    fixture.detectChanges();
    const alertas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]'))
      .map((alerta) => (alerta.textContent ?? '').trim())
      .filter((texto) => texto !== '');
    expect(alertas).toEqual(['No pudimos agendar la cita: el hueco NO quedó apartado. Vuelve a intentarlo.']);
    // Y lo elegido sigue en el asistente: reintentar no obliga a volver a empezar.
    expect(component.scheduleTime()).toBe('10:00');
  });

  it('la nota SOAP que no se guardó NO queda en la historia', async () => {
    await createComponent();
    component.setRole('doctor');
    await flushMicrotasks();
    component.navigate('chart', VALENTINA.id);
    await flushMicrotasks();
    const before = component.chart()?.history.length ?? 0;

    vi.stubGlobal('fetch', vi.fn(servidorFalso({ caidos: ['POST /encounter'] })));
    component.startEncounter();
    component.soapSubjective.set('Refiere tos nocturna.');
    component.soapAssessment.set('Asma en control.');
    component.soapPlan.set('Continuar salbutamol.');

    await component.saveEncounter();
    await flushMicrotasks();

    // Antes: la nota entraba en la historia ANTES de llamar, el cliente devolvía esa
    // misma nota optimista y la pantalla cerraba el encuentro con el AVS escrito.
    expect(component.chart()?.history.length).toBe(before);
    expect(component.view()).toBe('encounter');
    expect(component.closedAvs()).toBe('');
    expect(component.errorMessage()).toContain('NO quedó en la historia');
    // Y lo tecleado sigue ahí: el médico reintenta, no vuelve a escribir.
    expect(component.soapSubjective()).toBe('Refiere tos nocturna.');
  });

  it('nota guardada + receta caída: lo dice, y el reintento no duplica la nota', async () => {
    await createComponent();
    component.setRole('doctor');
    await flushMicrotasks();
    component.navigate('chart', MARIA.id);
    await flushMicrotasks();
    const notasAntes = component.chart()?.history.length ?? 0;
    const recetasAntes = component.chart()?.prescriptions.length ?? 0;

    vi.stubGlobal('fetch', vi.fn(servidorFalso({ caidos: ['POST /prescription'] })));
    component.startEncounter();
    component.soapSubjective.set('Control de tensión.');
    component.soapAssessment.set('HTA controlada.');
    component.soapPlan.set('Seguir igual.');
    component.rxDrug.set('Losartán');
    component.rxDose.set('50 mg');
    component.addRxItem();

    await component.saveEncounter();
    await flushMicrotasks();

    expect(component.chart()?.history.length).toBe(notasAntes + 1);
    // La receta NO está: una receta pintada en la historia que la farmacia no puede
    // ver es peor que ninguna.
    expect(component.chart()?.prescriptions.length).toBe(recetasAntes);
    expect(component.view()).toBe('encounter');
    expect(component.errorMessage()).toContain('La nota quedó guardada');

    // Vuelve el endpoint y se reintenta: se emite la receta y la nota NO se duplica.
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    await component.saveEncounter();
    await flushMicrotasks();

    expect(component.chart()?.history.length).toBe(notasAntes + 1);
    expect(component.chart()?.prescriptions.length).toBe(recetasAntes + 1);
    expect(component.view()).toBe('chart');
    expect(component.errorMessage()).toBe('');
  });

  it('la renovación que no llegó vuelve a su estado, no se queda «Solicitada»', async () => {
    await createComponent();
    component.navigate('medications');
    await flushMicrotasks();
    const med = component.medications()[0];
    expect(med.refillStatus).toBeNull();

    vi.stubGlobal('fetch', vi.fn(servidorFalso({ caidos: ['POST /refill'] })));
    component.requestRefill(med);
    await flushMicrotasks();

    // Se quedaba «Solicitada» para siempre con el servidor sin nada: el paciente
    // esperaba una renovación que nadie pidió y se quedaba sin medicamento.
    expect(component.medications()[0].refillStatus).toBeNull();
    expect(component.errorMessage()).toContain('NO quedó registrada');
  });

  it('el mensaje que no se envió queda MARCADO en el hilo, no acusado', async () => {
    await createComponent();
    component.navigate('messages');
    await flushMicrotasks();
    const thread = component.threads()[0];
    component.onThreadSelect(thread);
    fixture.detectChanges();

    vi.stubGlobal('fetch', vi.fn(servidorFalso({ caidos: ['POST /message'] })));
    component.onSendMessage({ thread, body: '¿Puedo tomar el otro medicamento?' });
    await flushMicrotasks();
    fixture.detectChanges();

    const enviado = component.activeThread()?.messages.at(-1);
    expect(enviado?.body).toBe('¿Puedo tomar el otro medicamento?');
    expect(enviado?.failed).toBe(true);
    const texto: string = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('No enviado');
    expect(component.errorMessage()).toContain('NO se envió');

    // Vuelve el borde: se reintenta desde el propio hilo, sin volver a teclear.
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    component.retryMessage(component.activeThread()!, component.activeThread()!.messages.at(-1)!);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.activeThread()?.messages.at(-1)?.failed).toBe(false);
    expect(component.errorMessage()).toBe('');
  });

  // ── identidad reactiva: la base de la API llega DESPUÉS del constructor ──────
  // En Angular Elements el `config` del CMS se aplica tras crear el componente: el effect
  // reacciona a la base y recarga la vista actual. El paciente ya no es un input (#197):
  // es el de la sesión, y lo dice `portal/home`.
  it('carga el portal cuando la base llega después de construir, con el paciente de la SESIÓN', async () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    const fetchMock = vi.fn(servidorFalso({ sesion: { paciente: VALENTINA, clinico: null } }));
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
    // Primer tick: sin base no se llama a nada.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(component.home()).toBeNull();

    fixture.componentRef.setInput('config', NEGOCIO_DEL_CMS);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(component.patientId()).toBe(VALENTINA.id);
    expect(component.home()?.patient.name).toBe(VALENTINA.name);
    expect(component.readFailed('home')).toBe(false);
  });

  // ══ CMS#197 · LA HISTORIA ES LA DE LA SESIÓN, Y UNA NEGATIVA NO ES UNA CAÍDA ══
  //
  // El portal mandaba `?patient=` con el `patient` del editor o el `P-1` del componente, y el
  // servidor lo obedecía: cualquiera leía la historia de cualquiera cambiando un atributo. Hoy
  // el servidor resuelve la historia por el correo del miembro y la clínica por el rol, y
  // contesta 401/403/404 con `{ error }`. Ninguna de las tres cae a datos de muestra ni se lee
  // como «no pudimos cargar»: se degrada por AUSENCIA, nunca por NEGACIÓN (ADR 0112).

  /** Las alertas con texto que hay en pantalla. */
  function alertas(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]'))
      .map((alerta) => (alerta.textContent ?? '').trim())
      .filter((texto) => texto !== '');
  }

  it('sin sesión (401) pide iniciar sesión, enfoca el aviso y no pide nada más', async () => {
    await createComponent({ sesion: 'anonimo' });
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.access()).toBe('sin-sesion');
    expect(component.home()).toBeNull();
    // NO es una lectura fallida: no se ofrece reintentar lo que el servidor negó.
    expect(component.readFailed('home')).toBe(false);
    expect(alertas()).toEqual([]);

    const host: HTMLElement = fixture.nativeElement;
    const panel = host.querySelector<HTMLElement>('.ehr__access');
    expect(panel?.textContent).toContain('Inicia sesión para ver tu historia clínica');
    expect(panel?.querySelector('a')?.getAttribute('href')).toMatch(/^\/account\/login\?returnUrl=/);
    expect(document.activeElement).toBe(panel);
    expect(host.textContent).not.toContain('No pudimos leer tu portal');
    expect(host.textContent).not.toContain(MARIA.name);

    // Las otras vistas del paciente no se piden: sin identidad no hay de quién.
    const llamadas = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    component.navigate('results');
    await flushMicrotasks();
    fixture.detectChanges();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(llamadas);
    expect(component.results()).toEqual([]);
    expect(host.querySelector('.ehr__access')).not.toBeNull();
    expect(host.textContent).not.toContain('No pudimos leer tus resultados');
  });

  it('una cuenta sin historia vinculada (404 con `{ error }`) ve un estado vacío, no un error', async () => {
    await createComponent({ sesion: SIN_HISTORIA });
    fixture.detectChanges();

    expect(component.access()).toBe('sin-historia');
    expect(component.readFailed('home')).toBe(false);
    expect(alertas()).toEqual([]);
    const texto: string = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('Tu cuenta no tiene una historia clínica vinculada');
    expect(texto).not.toContain('No pudimos leer');
    expect(texto).not.toContain('Hola, ');
  });

  it('la caída (404 SIN cuerpo) sigue siendo una lectura fallida, no «sin historia»', async () => {
    await createComponent({ caidos: ['/portal/home'] });
    fixture.detectChanges();

    expect(component.access()).toBe('ok');
    expect(component.readFailed('home')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No pudimos leer tu portal');
    expect(fixture.nativeElement.textContent).not.toContain('historia clínica vinculada');
  });

  it('sin rol clínico (403) dice que no hay permiso, y no pinta la agenda de nadie', async () => {
    await createComponent({ sesion: SOLO_PACIENTE });
    component.setRole('doctor');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.access()).toBe('sin-permiso');
    expect(component.board()).toEqual([]);
    expect(component.readFailed('board')).toBe(false);
    expect(alertas()).toEqual([]);
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.ehr__access')?.textContent).toContain('Tu cuenta no tiene permiso clínico');
    expect(host.textContent).not.toContain(VALENTINA.name);
    expect(host.textContent).not.toContain('No pudimos cargar la agenda');

    // La salida que ofrece es su propio portal, que sí abre.
    (host.querySelector('.ehr__access button') as HTMLButtonElement).click();
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.portal()).toBe('patient');
    expect(component.access()).toBe('ok');
    expect(component.home()?.patient.name).toBe(MARIA.name);
  });

  it('no manda el paciente ni el usuario: ni en la URL ni en el cuerpo', async () => {
    const fetchMock = vi.fn(servidorFalso({ sesion: SOLO_PACIENTE }));
    await createComponent({ sesion: SOLO_PACIENTE });
    vi.stubGlobal('fetch', fetchMock);

    for (const vista of ['visits', 'results', 'medications', 'health', 'billing', 'messages'] as const) {
      component.navigate(vista);
      await flushMicrotasks();
    }
    component.requestRefill(component.medications()[0]);
    const hilo = component.threads()[0];
    component.onThreadSelect(hilo);
    component.onSendMessage({ thread: hilo, body: 'Gracias, doctora.' });
    await flushMicrotasks();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/results'))).toBe(true);
    expect(urls.filter((url) => /[?&](patient|user)=/.test(url))).toEqual([]);
    // `/appointments` es la agenda clínica de TODOS: el portal ya no la baja para filtrarla.
    expect(urls.filter((url) => url.includes('/appointments'))).toEqual([]);
    const cuerpos = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([url, init]) => [String(url), JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>] as const);
    expect(cuerpos.map(([url]) => url.slice(url.lastIndexOf('/')))).toEqual(['/refill', '/message']);
    for (const [, cuerpo] of cuerpos) {
      expect(Object.keys(cuerpo)).not.toContain('patientId');
      expect(Object.keys(cuerpo)).not.toContain('user');
      expect(Object.keys(cuerpo)).not.toContain('from');
    }
  });

  it('el In Basket es el del médico de la sesión; sin médico vinculado se elige', async () => {
    const fetchMock = vi.fn(servidorFalso());
    await createComponent();
    vi.stubGlobal('fetch', fetchMock);
    component.setRole('doctor');
    component.navigate('inbasket');
    await flushMicrotasks();

    // Antes mandaba `?provider=doctor` —el NOMBRE del rol—: la bandeja salía vacía y «al día».
    expect(component.inbox().map((item) => item.title)).toEqual(['Glucosa por revisar']);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('provider='))).toEqual([]);

    // Enfermería: rol clínico sin médico vinculado. El 400 NO es una bandeja ilegible.
    TestBed.resetTestingModule();
    await createComponent({ sesion: ENFERMERIA });
    component.setRole('nurse');
    component.navigate('inbasket');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.inboxNeedsProvider()).toBe(true);
    expect(component.readFailed('inbox')).toBe(false);
    expect(alertas()).toEqual([]);
    const host: HTMLElement = fixture.nativeElement;
    const selector = host.querySelector<HTMLSelectElement>('.ehr__provider-pick select');
    expect(Array.from(selector?.options ?? []).map((opcion) => opcion.value)).toEqual(['', 'doc-mendez', 'doc-rojas']);

    selector!.value = 'doc-rojas';
    selector!.dispatchEvent(new Event('change'));
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.inbox().map((item) => item.title)).toEqual(['Espirometría por revisar']);
    expect(component.inboxNeedsProvider()).toBe(false);
  });

  it('una historia sin estado de cuenta es «Sin facturación aún», no una lectura fallida', async () => {
    await createComponent({ sinEstadoDeCuenta: true });
    component.navigate('billing');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.billing()).toBeNull();
    expect(component.readFailed('billing')).toBe(false);
    expect(component.access()).toBe('ok');
    expect(fixture.nativeElement.textContent).toContain('Sin facturación aún');
    expect(fixture.nativeElement.textContent).not.toContain('No pudimos leer tu facturación');
  });

  it('la nota que el servidor NEGÓ lo dice, y lo tecleado sigue a la vista', async () => {
    await createComponent();
    component.setRole('doctor');
    await flushMicrotasks();
    component.navigate('chart', VALENTINA.id);
    await flushMicrotasks();
    const before = component.chart()?.history.length ?? 0;

    vi.stubGlobal('fetch', vi.fn(servidorFalso({ sesion: 'anonimo' })));
    component.startEncounter();
    component.soapSubjective.set('Refiere tos nocturna.');
    component.soapAssessment.set('Asma en control.');
    component.soapPlan.set('Continuar salbutamol.');
    await component.saveEncounter();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.chart()?.history.length).toBe(before);
    expect(component.view()).toBe('encounter');
    expect(component.errorMessage()).toContain('Tu sesión no está activa');
    expect(component.soapSubjective()).toBe('Refiere tos nocturna.');
    // El formulario no se cambia por el panel de acceso: lo tecleado tiene que seguir ahí.
    expect(fixture.nativeElement.querySelector('.ehr__access')).toBeNull();
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
    await createComponent({ caidos: ['/portal/home'], sesion: { paciente: VALENTINA, clinico: null } });

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

  // ══ #111 · LO QUE EL BORDE DEJÓ DE AFIRMAR NO LO REPONE EL CLIENTE ══════════

  it('«no sabemos si hay sin leer» no se ve como «no tienes sin leer»', async () => {
    await createComponent();
    component.navigate('messages');
    await flushMicrotasks();
    fixture.detectChanges();

    // El borde ya no emite `unread`; el normalizador lo reponía a 0 y la insignia
    // sólo se pinta con `> 0`, así que las dos cosas se veían IGUAL — y eso es lo
    // que hace que alguien no abra el mensaje de su médico.
    expect(component.threads()[0].unread).toBeNull();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.ehr__thread-unread--unknown')).not.toBeNull();
    expect(host.querySelector('.ehr__thread-unread--unknown')?.textContent?.trim()).toBe('?');

    // Y cuando el backend SÍ lo sabe, se respeta: la insignia es la cuenta.
    TestBed.resetTestingModule();
    await createComponent({ opcionales: 'full' });
    component.navigate('messages');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.threads()[0].unread).toBe(1);
    const host2: HTMLElement = fixture.nativeElement;
    expect(host2.querySelector('.ehr__thread-unread--unknown')).toBeNull();
    expect(host2.querySelector('.ehr__thread-unread')?.textContent?.trim()).toBe('1');
  });

  it('los «sin leer» del home tampoco se reponen a cero (CMS#116)', async () => {
    await createComponent();
    await flushMicrotasks();

    // Era el último de la familia: aquí la cifra no era una constante, se DERIVABA
    // sumando los mensajes de cada hilo clínico — los del propio paciente incluidos—.
    // Una derivación de lo que hay a mano se lee como un dato y fabrica igual.
    expect(component.home()?.unreadMessages).toBeNull();

    // Y cuando el backend sepa contarlos, se respeta el número que mande.
    TestBed.resetTestingModule();
    await createComponent({ opcionales: 'full' });
    await flushMicrotasks();
    expect(component.home()?.unreadMessages).toBe(4);
  });

  it('sin farmacia no queda el separador colgante en la ficha del medicamento', async () => {
    await createComponent();
    component.navigate('medications');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.medications()[0].pharmacy).toBeNull();
    const meta = fixture.nativeElement.querySelector('.ehr__med-meta')?.textContent ?? '';
    expect(meta.trim()).toBe('2 renovaciones restantes');
    expect(meta.trim().startsWith('·')).toBe(false);

    TestBed.resetTestingModule();
    await createComponent({ opcionales: 'full' });
    component.navigate('medications');
    await flushMicrotasks();
    fixture.detectChanges();

    const conFarmacia = fixture.nativeElement.querySelector('.ehr__med-meta')?.textContent ?? '';
    expect(conFarmacia).toContain('Farmacia Central ·');
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

  // ── CMS#196: el copago que se muestra es el que el servidor cobra ─────────────
  //
  // Era `DEFAULT_COPAY_MINOR = 0` compilado: la pantalla decía «Sin costo» mientras el
  // motor en proceso del CMS capturaba 80.000 al agendar. Ahora lo pregunta a `GET /copay`.

  it('el copago lo dice el servidor que lo cobra, y el carrito lo suma', async () => {
    await createComponent({ copago: 80_000 });

    await agendarPorElAsistente();

    expect(component.copayMinor()).toBe(8_000_000);
    expect(component.scheduleConfig().steps.some((s) => s.id === 'copago')).toBe(true);
    expect(component.scheduleConfig().totalLabel).toBe('Copago');
  });

  it('sin un copago conocido no dice «Sin costo»: dice que no lo sabe', async () => {
    await createComponent({ copago: null });

    component.navigate('schedule');
    await flushMicrotasks();

    expect(component.copayUnknown()).toBe(true);
    expect(component.scheduleConfig().steps.some((s) => s.id === 'copago')).toBe(true);
    expect(component.scheduleConfig().totalLabel).toBe('Copago');
  });

  it('un copago de cero sí es «Sin costo»', async () => {
    await createComponent({ copago: 0 });

    component.navigate('schedule');
    await flushMicrotasks();

    expect(component.copayUnknown()).toBe(false);
    expect(component.scheduleConfig().steps.some((s) => s.id === 'copago')).toBe(false);
    expect(component.scheduleConfig().totalLabel).toBe('Sin costo');
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
      ['copay', () => client.copay('/api/ehr')],
      ['portalHome', () => client.portalHome('/api/ehr')],
      ['results', () => client.results('/api/ehr')],
      ['medications', () => client.medications('/api/ehr')],
      ['healthSummary', () => client.healthSummary('/api/ehr')],
      ['billing', () => client.billing('/api/ehr')],
      ['messages', () => client.messages('/api/ehr')],
      ['inbox', () => client.inbox('/api/ehr')],
      ['schedule', () => client.schedule('/api/ehr', '2026-09-14')],
    ];

    for (const [nombre, lectura] of lecturas) {
      await expect(lectura(), nombre).rejects.toBeInstanceOf(EhrUnavailableError);
    }
  });

  it('una ESCRITURA clínica que falla LANZA — no devuelve el valor optimista', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    // Las seis, una por una: el barrido es el gate. Añadir una escritura nueva con
    // `catch → valor del llamador` sin añadirla aquí es cómo volvería el defecto.
    const escrituras: readonly [string, () => Promise<unknown>][] = [
      [
        'bookAppointment',
        () =>
          client.bookAppointment('/api/ehr', {
            patientId: MARIA.id,
            doctorId: 'doc-mendez',
            slot: { date: '2026-08-01', time: '10:00' },
          }),
      ],
      [
        'saveEncounter',
        () =>
          client.saveEncounter('/api/ehr', {
            patientId: MARIA.id,
            soap: {
              subjective: 's',
              objective: {
                systolic: 0,
                diastolic: 0,
                heartRate: 0,
                temperature: 0,
                weight: 0,
                height: 0,
                glucose: 0,
              },
              assessment: 'a',
              plan: 'p',
            },
          }),
      ],
      [
        'savePrescription',
        () =>
          client.savePrescription('/api/ehr', {
            patientId: MARIA.id,
            items: [{ drug: 'Losartán', dose: '50 mg', frequency: 'c/12h', durationDays: 30 }],
          }),
      ],
      [
        'requestRefill',
        () => client.requestRefill('/api/ehr', { medicationId: 'm-1' }),
      ],
      [
        'sendMessage',
        () => client.sendMessage('/api/ehr', { threadId: 'hilo-1', body: 'hola' }),
      ],
      [
        'placeOrder',
        () => client.placeOrder('/api/ehr', { patientId: MARIA.id, kind: 'lab', detail: 'x' }),
      ],
    ];

    for (const [nombre, escritura] of escrituras) {
      await expect(escritura(), nombre).rejects.toBeInstanceOf(EhrWriteFailedError);
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
    expect((await client.healthSummary('/api/ehr')).immunizations).toBeNull();

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ vacunas: 'empty' })));
    client = createClient();
    expect((await client.healthSummary('/api/ehr')).immunizations).toEqual([]);
  });

  it('un preventivo sin `status` se normaliza a `null`, no a «pendiente»', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    const client = createClient();
    const summary = await client.healthSummary('/api/ehr');

    expect(summary.maintenance[0].status).toBeNull();
  });

  it('`active` y `acceptingPatients` ausentes son `null`, NUNCA `true`', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    let client = createClient();

    // Reponer `true` es afirmar lo que el borde se cuidó de no decir: un paciente
    // inactivo tratado como activo, y un médico que «acepta pacientes nuevos» por
    // decisión del cliente.
    expect((await client.patients('/api/ehr', ''))[0].active).toBeNull();
    expect((await client.doctors('/api/ehr'))[0].acceptingPatients).toBeNull();

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ opcionales: 'full' })));
    client = createClient();
    expect((await client.patients('/api/ehr', ''))[0].active).toBe(true);
    expect((await client.doctors('/api/ehr'))[0].acceptingPatients).toBe(true);
  });

  it('un copago sin el número no es un cero: lanza, no dice «sin costo» (CMS#196)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ currency: 'COP' }) } as Response)),
    );

    await expect(createClient().copay('/api/ehr')).rejects.toBeInstanceOf(EhrUnavailableError);
  });

  it('el tablero del día se normaliza sin `checkedInAhead` (ya no se emite)', async () => {
    vi.stubGlobal('fetch', vi.fn(servidorFalso()));
    const client = createClient();
    const board = await client.schedule('/api/ehr', '2026-09-14');

    expect(board.length).toBe(2);
    expect(Object.keys(board[0])).not.toContain('checkedInAhead');
  });

  // ── CMS#197: la negativa del servidor sale con su motivo, no como «no disponible» ──
  it('cada negativa sale como `EhrAccesoDenegadoError` con su motivo; la caída, no', async () => {
    const motivo = async (lectura: () => Promise<unknown>): Promise<string> => {
      const error = await lectura().then(
        () => null,
        (rechazo: unknown) => rechazo,
      );
      return error instanceof EhrAccesoDenegadoError ? error.motivo : String((error as Error | null)?.name);
    };

    vi.stubGlobal('fetch', vi.fn(servidorFalso({ sesion: 'anonimo' })));
    let client = createClient();
    expect(await motivo(() => client.portalHome('/api/ehr'))).toBe('sin-sesion');
    expect(await motivo(() => client.patients('/api/ehr', ''))).toBe('sin-sesion');
    expect(await motivo(() => client.requestRefill('/api/ehr', { medicationId: 'm-1' }))).toBe('sin-sesion');

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ sesion: SIN_HISTORIA })));
    client = createClient();
    expect(await motivo(() => client.results('/api/ehr'))).toBe('sin-historia');
    expect(await motivo(() => client.schedule('/api/ehr', '2026-09-14'))).toBe('sin-permiso');

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ sesion: ENFERMERIA })));
    client = createClient();
    expect(await motivo(() => client.inbox('/api/ehr'))).toBe('sin-medico');
    expect((await client.inbox('/api/ehr', 'doc-rojas')).map((item) => item.patientId)).toEqual([VALENTINA.id]);

    // El `[DevSeedOnly]` apagado contesta 404 SIN cuerpo: eso es una caída, no «sin historia».
    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ caidos: ['/portal/home', '/billing'] })));
    client = createClient();
    expect(await motivo(() => client.portalHome('/api/ehr'))).toBe('EhrUnavailableError');
    expect(await motivo(() => client.billing('/api/ehr'))).toBe('EhrUnavailableError');

    // Y el 404 CON cuerpo de `billing` —hay historia, sin estado de cuenta— es `null`.
    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(servidorFalso({ sinEstadoDeCuenta: true })));
    expect(await createClient().billing('/api/ehr')).toBeNull();
  });
});
