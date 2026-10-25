import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { AcademyApiClient } from './academy-api.client';
import { AcademyFulfillmentStrategy, RAZON_ACTIVANDO } from './academy-fulfillment.strategy';
import { AcademyElementComponent, mensajeDeLaMatricula, sanitizeAcademyConfig } from './academy';
import { entradaDeLaMatricula, leerMatricula, llaveDeLaMatricula } from './academy-matricula';
import { asentar } from '../../../../../../tools/asentar';
import { ACADEMY_SYNHOST } from '@synergos/contracts';
import { definirCoordinador } from '@synergos/vitals-core';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: ACADEMY_SYNHOST.ejemplo.apiBase };

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
 * Un `fetch` que contesta **sólo** `GET /api/academy/learning` y deja caer el resto
 * (el catálogo tiene su mock declarado y no es lo que se prueba aquí).
 *
 * Existe por la regla 16: con todos los specs stubeando la red para que falle, el
 * sistema bajo prueba es el fallback — y el defecto de #102 era justamente que el
 * camino BUENO con la respuesta VACÍA no se podía alcanzar.
 */
function bordeConAprendizaje(
  learning: { status: number; body?: unknown },
  urls: string[] = [],
): (url: string) => Promise<Response> {
  return (url: string) => {
    urls.push(String(url));
    if (!String(url).includes('/learning')) {
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve({
      ok: learning.status >= 200 && learning.status < 300,
      status: learning.status,
      json: () => Promise.resolve(learning.body ?? {}),
    } as Response);
  };
}

/**
 * Un borde de AULA de mentira: contesta la ESCRITURA del progreso (y el certificado
 * si se le da uno) y deja caer el resto, que tiene su mock declarado.
 *
 * Tres decisiones del fixture, y las tres hacen falta (regla 7 — el dato de prueba
 * tiene que EXIGIR la regla):
 *
 *  - **Apaga por MÉTODO y ruta** (`'POST /progress'`), como el borde falso del EHR.
 *    `'/progress'` a secas mataría también el `GET` que el aula lee al entrar, y el
 *    apagón PARCIAL es el único que alcanza una escritura: toda escritura va detrás
 *    de una lectura que funcionó (regla 18).
 *  - **El porcentaje que devuelve NO es el que el aula calcula en local.** El borde
 *    lo saca de su propio currículum (`percentPorMarca`), así que un cliente que
 *    devuelva el optimista da otro número. Con los dos iguales, emitir el del
 *    servidor o el de casa daría el mismo verde.
 *  - **Apunta lo que recibió**, para poder afirmar que un reintento no duplica y que
 *    una marca que falló NO se dio por hecha.
 */
interface BordeDeAula {
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Las lecciones que recibió `POST /progress`. */
  readonly marcadas: string[];
  /** Los cursos que recibió `POST /enroll` — una entrada por llamada. */
  readonly matriculas: string[];
  /** Las órdenes que recibió `POST /confirm` — una entrada por llamada. */
  readonly confirmaciones: string[];
  /** Toda URL pedida, en orden. */
  readonly urls: string[];
  /** Interruptores que se pueden mover A MITAD de un test (`'POST /confirm'`). */
  caidos: string[];
}

function bordeDeAula(opciones: {
  readonly percentPorMarca: readonly number[];
  readonly caidos?: readonly string[];
  readonly certificado?: Record<string, unknown>;
  /**
   * Lo que contesta `POST /enroll`. Por defecto la rama GRATIS con el id que emite
   * `EnrolledResponse` — la de pago se pide explícitamente porque el curso de pago
   * es el que pasa por el asistente.
   */
  readonly enroll?: Record<string, unknown>;
  /** Lo que contesta `POST /confirm`. */
  readonly confirm?: Record<string, unknown>;
}): BordeDeAula {
  const marcadas: string[] = [];
  const matriculas: string[] = [];
  const confirmaciones: string[] = [];
  const urls: string[] = [];
  const estado: BordeDeAula = {
    marcadas,
    matriculas,
    confirmaciones,
    urls,
    caidos: [...(opciones.caidos ?? [])],
    fetch: (url: string, init?: RequestInit) => {
      const metodo = (init?.method ?? 'GET').toUpperCase();
      const ruta = String(url);
      urls.push(ruta);
      const caido = estado.caidos.some((entrada) => {
        const [cabeza, cola] = entrada.split(' ');
        return cola === undefined ? ruta.includes(cabeza) : cabeza === metodo && ruta.includes(cola);
      });
      if (caido) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
        } as Response);
      }
      const responde = (body: unknown): Promise<Response> =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

      if (metodo === 'POST' && ruta.includes('/enroll')) {
        const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { courseId?: string };
        matriculas.push(String(cuerpo.courseId ?? ''));
        // La rama gratis de `EnrollAsync` activa la matrícula en el acto y devuelve
        // su id; NUNCA pasa por `ConfirmAsync`.
        return responde(opciones.enroll ?? { enrolled: true, enrollmentId: 'ENR-BORDE-GRATIS' });
      }
      if (metodo === 'POST' && ruta.includes('/confirm')) {
        const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { orderRef?: string };
        confirmaciones.push(String(cuerpo.orderRef ?? ''));
        return responde(
          opciones.confirm ?? {
            status: 'active',
            enrollmentId: 'ENR-BORDE-PAGO',
            courseId: 'CMOCK-1',
          },
        );
      }
      if (metodo === 'POST' && ruta.includes('/progress')) {
        const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { lessonId?: string };
        marcadas.push(String(cuerpo.lessonId ?? ''));
        const indice = Math.min(marcadas.length - 1, opciones.percentPorMarca.length - 1);
        return responde({ percent: opciones.percentPorMarca[indice] });
      }
      if (metodo === 'GET' && ruta.includes('/certificate') && opciones.certificado) {
        return responde({ certificate: opciones.certificado });
      }
      return Promise.reject(new Error('offline'));
    },
  };
  return estado;
}

/** La rama de PAGO de `POST /enroll` — abre una orden y su sesión de PSP. */
const ENROLL_DE_PAGO = {
  orderRef: 'ORD-BORDE-7',
  paymentSessionId: 'psp_borde_7',
  amount: 180_000,
  currency: 'COP',
} as const;

/** Una matrícula con la forma que emite `EnrolledCourseDto`. */
function matriculaServidor(): Record<string, unknown> {
  return {
    enrollmentId: 'ENR-SRV-1',
    course: {
      id: 'C-SERVIDOR',
      title: 'Curso que SÍ compró',
      subtitle: 'El que devuelve el borde',
      amount: 0,
      currency: 'COP',
      category: 'Desarrollo',
      level: 'beginner',
      durationMinutes: 60,
      lessonCount: 10,
      rating: 0,
      studentCount: 1,
      instructorName: 'Quien sea',
      cover: '',
      badges: [],
    },
    percent: 30,
    lessonCount: 10,
    completedCount: 3,
    lastActivityAt: '2026-09-01',
    completed: false,
  };
}

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 12): Promise<void> {
  await asentar(times);
}

describe('AcademyElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<AcademyElementComponent>;
  let component: AcademyElementComponent;

  async function createComponent(config: object = NEGOCIO_DEL_CMS): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AcademyElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        AcademyApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: AcademyFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AcademyElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // La búsqueda inicial corre en ngOnInit, ya con el config del CMS; que asiente.
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

  // ── empty: pristine portal, catalogue view, mock catalogue, no enrolment ──────
  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('sin la base de la API no llama a nada y degrada, visible (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    expect(component.courses().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/mi-aprendizaje';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/mi-aprendizaje');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.view()).toBe('learning');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    component.navigate('catalog');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1');
  });

  it('opens on the SH-1 catalogue with seeded courses and facets (empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('student');
    expect(component.view()).toBe('catalog');
    expect(component.enrollmentId()).toBe('');
    expect(component.courses().length).toBeGreaterThan(0);
    expect(component.facets().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── #83: el método de pago lo pinta `syn-segmented` ─────────────────────────────
  //
  // Era un `role="radiogroup"` cuyos hijos eran <button> SIN `role="radio"`: el lector
  // anunciaba un grupo de opciones sin opciones, y ninguna marcada. Se busca por ROL y
  // NOMBRE, y lo que se mira al final es el instrumento que recibe el `pay`.
  it('el método de pago es un radiogroup CON radios y el elegido llega al instrumento (#83)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openCourse(component.courses().find((c) => c.amount > 0)!);
    await flushMicrotasks();
    component.studentName.set('Ada Lovelace');
    component.studentEmail.set('ada@example.com');
    component.startEnrollment();
    await flushMicrotasks();
    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    wizard.next(); // plan → student, donde vive el método de pago
    fixture.detectChanges();
    await flushMicrotasks();

    const group = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'syn-segmented [role="radiogroup"][aria-label="Método de pago"]',
    );
    expect(group).not.toBeNull();
    const radios = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const estado = (): string[][] =>
      radios.map((radio) => [radio.textContent?.trim() ?? '', radio.getAttribute('aria-checked') ?? '']);
    expect(estado()).toEqual([
      ['Tarjeta', 'true'],
      ['PSE', 'false'],
    ]);

    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(estado()).toEqual([
      ['Tarjeta', 'false'],
      ['PSE', 'true'],
    ]);
    expect(component.enrollInstrument()['provider']).toBe('academy-pse');

    component.setPaymentMethod('efectivo');
    expect(component.paymentMethod()).toBe('pse');
  });

  // ── happy: PDD → SH-3 wizard → confirm → classroom → complete → certificate ───
  it('runs the full enrolment lifecycle through the SH-3 wizard (happy case)', async () => {
    installMemoryStorage();
    // Todo el flujo corre sobre el catálogo sembrado, MENOS el certificado y el
    // AVANCE: esos dos los contesta el borde. Una credencial no se fabrica, y un
    // avance tampoco — antes este test completaba el curso con la red caída, o sea
    // afirmaba en verde justo el defecto de #116 (regla 9: un test que codifica el
    // defecto convierte el arreglo en una regresión).
    //
    // Los porcentajes del borde NO son los que el aula calcula (1/7 = 14 %, 2/7 =
    // 29 %…): salen de su currículum. Si coincidieran, devolver el del servidor o el
    // de casa daría el mismo verde.
    const aula = bordeDeAula({
      percentPorMarca: [10, 20, 35, 50, 65, 80, 100],
      enroll: ENROLL_DE_PAGO,
      certificado: {
        id: 'CERT-SELLADO-9',
        studentName: 'Ada Lovelace',
        courseTitle: 'Angular',
        issuedAt: '2026-05-04T00:00:00Z',
        verifyUrl: 'https://synergos.test/academy/verify/CERT-SELLADO-9',
      },
    });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();

    // Open a PAID course (CMOCK-1) so the wizard path runs (free would skip it).
    component.openCourse(component.courses().find((c) => c.amount > 0)!);
    await flushMicrotasks();
    expect(component.view()).toBe('course');
    expect(component.isFreeCourse()).toBe(false);

    component.studentName.set('Ada Lovelace');
    component.studentEmail.set('ada@example.com');
    component.startEnrollment();
    await flushMicrotasks();
    expect(component.view()).toBe('checkout');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    wizard.next(); // submit → pay → confirm (matrícula activa, mock)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('enrolled');
    // El id es el que emitió el BORDE. Con el acuse fabricado salía un `ENR-<orden>`
    // derivado de la referencia que este mismo cliente acababa de inventarse.
    expect(component.enrollmentId()).toBe('ENR-BORDE-PAGO');
    expect(aula.matriculas).toEqual([component.detail()!.course.id]);
    expect(aula.confirmaciones).toEqual(['ORD-BORDE-7']);

    // Enter the aula and complete every lesson → certificate available.
    component.enterClassroom();
    fixture.detectChanges();
    expect(component.view()).toBe('classroom');
    const lecciones = component.orderedLessons();
    component.selectLesson(lecciones[0]);
    component.markLessonComplete();
    await flushMicrotasks();
    // El número que queda es el del SERVIDOR (10 %), no el que el aula calculó (14 %).
    expect(component.progressPercent()).toBe(10);
    for (const lesson of lecciones.slice(1)) {
      component.selectLesson(lesson);
      component.markLessonComplete();
      await flushMicrotasks();
    }
    expect(aula.marcadas).toEqual(lecciones.map((lesson) => lesson.id));
    expect(component.isCourseComplete()).toBe(true);

    component.viewCertificate();
    await flushMicrotasks();
    expect(component.view()).toBe('certificate');
    expect(component.walletCredentials().length).toBe(1);
    // El id y la URL son los del SERVIDOR. Con la credencial fabricada esto era un
    // `CERT-<random>` apuntando a un dominio que no existe.
    expect(component.walletCredentials()[0].id).toBe('CERT-SELLADO-9');
    expect(component.walletCredentials()[0].qrData).toBe(
      'https://synergos.test/academy/verify/CERT-SELLADO-9',
    );
  });

  // ── free course: enroll directo skips the wizard ─────────────────────────────
  it('enrols a free course directly (no wizard, enroll directo)', async () => {
    installMemoryStorage();
    const aula = bordeDeAula({ percentPorMarca: [] });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();

    component.openCourse(component.courses().find((c) => c.amount <= 0)!);
    await flushMicrotasks();
    expect(component.isFreeCourse()).toBe(true);

    component.startEnrollment();
    await flushMicrotasks(30);
    expect(component.view()).toBe('enrolled');
    // El id es el que emitió el borde al matricular, y **no se pasa por `/confirm`**:
    // la rama gratis nunca abre una orden, así que pedir confirmarla contestaba 404
    // y el `catch` devolvía un `ENR-FREE-<ts>` que no existe en ninguna parte.
    expect(component.enrollmentId()).toBe('ENR-BORDE-GRATIS');
    expect(aula.confirmaciones).toEqual([]);
    expect(aula.urls.some((url) => url.includes('/confirm'))).toBe(false);
  });

  // ── #116 · el avance que el servidor NO guardó ───────────────────────────────

  /** Entra al aula por el curso gratis, que no pasa por el asistente. */
  async function entraAlAula(): Promise<void> {
    component.openCourse(component.courses().find((c) => c.amount <= 0)!);
    await flushMicrotasks();
    component.startEnrollment();
    await flushMicrotasks(30);
    component.enterClassroom();
    fixture.detectChanges();
    expect(component.view()).toBe('classroom');
  }

  it('EL caso: una marca que el servidor no guardó NO deja la barra avanzada', async () => {
    installMemoryStorage();
    // Apagón PARCIAL: el aula se abre (la lectura del progreso va por el mock del
    // catálogo) y lo único caído es la ESCRITURA. Un apagón total no alcanza nunca a
    // una escritura, porque va detrás de una lectura que funcionó (regla 18).
    const aula = bordeDeAula({ percentPorMarca: [55], caidos: ['POST /progress'] });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();
    await entraAlAula();

    const emitidos: unknown[] = [];
    component.lessoncompleted.subscribe((evento) => emitidos.push(evento));

    const leccion = component.orderedLessons()[0];
    component.selectLesson(leccion);
    component.markLessonComplete();
    await flushMicrotasks();
    fixture.detectChanges();

    // Nada quedó guardado: ni la palomita, ni la barra, ni el evento que sale al bus.
    expect(component.isLessonComplete(leccion.id)).toBe(false);
    expect(component.progressPercent()).toBe(0);
    expect(emitidos).toEqual([]);
    // Y se DICE, porque si no el alumno ve deshacerse su palomita sin explicación.
    expect(component.progressNotice()).toContain('No pudimos guardar');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.academy__progress-notice')
        ?.textContent,
    ).toContain('No pudimos guardar');
  });

  it('el porcentaje que queda es el del SERVIDOR, no el que calcula el aula', async () => {
    installMemoryStorage();
    // 7 lecciones → el aula calcularía 14 %. El borde dice 55 %, que es un número que
    // ninguna cuenta local de esta pantalla puede producir.
    const aula = bordeDeAula({ percentPorMarca: [55] });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();
    await entraAlAula();

    const leccion = component.orderedLessons()[0];
    component.selectLesson(leccion);
    component.markLessonComplete();
    await flushMicrotasks();

    expect(component.progressPercent()).toBe(55);
    expect(component.isLessonComplete(leccion.id)).toBe(true);
    expect(component.progressNotice()).toBe('');
    expect(aula.marcadas).toEqual([leccion.id]);
  });

  it('desmarcar no se finge: el contrato sólo sabe MARCAR', async () => {
    installMemoryStorage();
    const aula = bordeDeAula({ percentPorMarca: [55] });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();
    await entraAlAula();

    const leccion = component.orderedLessons()[0];
    component.toggleLessonCompleteFor(leccion);
    await flushMicrotasks();
    expect(component.isLessonComplete(leccion.id)).toBe(true);

    // Quitar la palomita dejaría la casilla vacía sobre un expediente donde la
    // lección sigue completa: la misma mentira con el signo cambiado.
    component.toggleLessonCompleteFor(leccion);
    await flushMicrotasks();
    expect(component.isLessonComplete(leccion.id)).toBe(true);
    expect(component.progressNotice()).toContain('no se puede desmarcar');
    expect(aula.marcadas).toEqual([leccion.id]);
  });

  it('confirma la matrícula contra la base del ELEMENTO, no contra una cableada', async () => {
    installMemoryStorage();
    // Un elemento montado contra otra base: compraba en la suya y confirmaba en
    // `/api/academy`, cableada a mano en `confirm` porque ese paso no recibe
    // instrumento. Y no fallaba a la vista, porque el `catch` del cliente fabricaba
    // el acuse de la matrícula (#116).
    //
    // Va sobre el curso de PAGO y contra un borde VIVO: desde CMS#117 el curso
    // gratis no llama a `/confirm` —su matrícula ya está activa— así que con el
    // gratis esta prueba se quedaría sin sujeto. Es el fixture que caduca con el
    // defecto de al lado: antes daba igual porque la llamada salía y fallaba.
    const aula = bordeDeAula({ percentPorMarca: [], enroll: ENROLL_DE_PAGO });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();
    fixture.componentRef.setInput('apiBase', '/entidad/aula');
    fixture.detectChanges();
    // La búsqueda inicial del constructor corrió con la base por defecto; lo que se
    // mide es lo que sale DESPUÉS de que el host declare la suya.
    aula.urls.length = 0;

    component.openCourse(component.courses().find((c) => c.amount > 0)!);
    await flushMicrotasks();
    component.studentName.set('Ada Lovelace');
    component.studentEmail.set('ada@example.com');
    component.startEnrollment();
    await flushMicrotasks();

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    wizard.next();
    await flushMicrotasks(30);

    const confirmaciones = aula.urls.filter((url) => url.includes('/confirm'));
    expect(confirmaciones.length).toBeGreaterThan(0);
    expect(confirmaciones.every((url) => url.startsWith('/entidad/aula/'))).toBe(true);
    expect(aula.urls.some((url) => url.startsWith('/api/academy/'))).toBe(false);
  });

  // ── CMS#117 · la matrícula que nadie activó ──────────────────────────────────

  /** El aviso de la FICHA (el banner de arriba), distinto del del asistente. */
  function bannerDeLaFicha(): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector('.academy__error')?.textContent ?? ''
    );
  }

  /**
   * Los `role="alert"` que dicen `texto`. El fallo del asistente lo dice el ASISTENTE, una
   * vez: la ficha lo repetía en su banner con otras palabras y el lector de pantalla oía dos
   * alertas seguidas (UI#91).
   */
  function alertasQueDicen(texto: string): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="alert"]')).filter(
      (alerta) => (alerta.textContent ?? '').includes(texto),
    );
  }

  /** Lleva el asistente hasta el último paso, listo para pulsar «Pagar». */
  async function hastaElBotonDePagar(): Promise<CheckoutWizardComponent> {
    component.openCourse(component.courses().find((c) => c.amount > 0)!);
    await flushMicrotasks();
    component.studentName.set('Ada Lovelace');
    component.studentEmail.set('ada@example.com');
    component.startEnrollment();
    await flushMicrotasks();
    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    return wizard;
  }

  it('EL caso: si el borde no abre la matrícula, NO hay acuse ni aula', async () => {
    installMemoryStorage();
    // Apagón PARCIAL y por MÉTODO: el catálogo y la ficha se leen, y lo único caído
    // es la ESCRITURA que abre la matrícula. Un apagón total no llega nunca hasta
    // aquí, porque comprar va detrás de una ficha que se pudo abrir (regla 18).
    const aula = bordeDeAula({ percentPorMarca: [], caidos: ['POST /enroll'] });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();
    const wizard = await hastaElBotonDePagar();

    wizard.next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    // Ni matrícula, ni aula, ni fila sembrada en «mi aprendizaje».
    expect(component.enrollmentId()).toBe('');
    expect(component.view()).toBe('checkout');
    expect(aula.confirmaciones).toEqual([]);
    // Lo tecleado sigue donde estaba: el asistente no se rebobina.
    expect(component.studentEmail()).toBe('ada@example.com');
    expect(wizard.isLastStep()).toBe(true);
    // Y se DICE, sin fabricar un número de matrícula que no existe — UNA vez, en el aviso
    // del asistente junto al botón. La ficha lo repetía en su banner (UI#91).
    expect(alertasQueDicen('no se te ha cobrado nada')).toHaveLength(1);
    expect(bannerDeLaFicha()).toBe('');
  });

  it('EL caso: cobrado y sin confirmar, reintentar NO vuelve a matricular', async () => {
    installMemoryStorage();
    // El primer paso SÍ sale (hay una orden abierta y una sesión de pago) y el
    // segundo no. Es el único reparto que alcanza el camino que importa.
    const aula = bordeDeAula({
      percentPorMarca: [],
      enroll: ENROLL_DE_PAGO,
      caidos: ['POST /confirm'],
    });
    vi.stubGlobal('fetch', vi.fn(aula.fetch));
    await createComponent();
    const wizard = await hastaElBotonDePagar();

    wizard.next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.enrollmentId()).toBe('');
    expect(aula.matriculas).toHaveLength(1);
    // Se intentó confirmar y el borde lo rechazó antes de leer el cuerpo, así que
    // la orden no queda anotada — lo que importa es que se intentó UNA vez.
    expect(aula.urls.filter((url) => url.includes('/confirm'))).toHaveLength(1);
    expect(aula.confirmaciones).toEqual([]);
    // El mensaje nombra lo que SÍ quedó: decirle «no pudimos matricularte» a quien
    // ya pagó le invita a pagar dos veces, y eso es daño propio.
    const aviso = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(aviso).toContain('Ya recibimos tu pago');
    expect(aviso).toContain('no se te cobrará de nuevo');
    // UNA alerta, y nombra el cobro que quedó con su referencia (UI#91): la ficha decía lo
    // mismo con otras palabras en un segundo `role="alert"`.
    expect(alertasQueDicen('no se te cobrará de nuevo')).toHaveLength(1);
    expect(alertasQueDicen('ORD-BORDE-7')).toHaveLength(1);
    expect(bannerDeLaFicha()).toBe('');

    // El borde vuelve: se reintenta SOLO la confirmación, que es idempotente del
    // otro lado. Volver a `POST /enroll` abriría otra orden y otro cobro.
    aula.caidos = [];
    wizard.next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(aula.matriculas).toHaveLength(1);
    expect(aula.confirmaciones).toEqual(['ORD-BORDE-7']);
    expect(aula.urls.filter((url) => url.includes('/confirm'))).toHaveLength(2);
    expect(component.enrollmentId()).toBe('ENR-BORDE-PAGO');
    expect(component.view()).toBe('enrolled');
  });

  // ── filter: SH-1 criteria filters the catalogue by escuela/categoría ──────────
  it('filters the catalogue by category through the discovery criteria (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.courses().length;
    component.onCriteriaChange({ term: '', facets: { category: ['Diseño'] }, sort: 'relevance', page: 1 });
    await flushMicrotasks();

    const after = component.courses();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((course) => course.category === 'Diseño')).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── mi aprendizaje (SH-4): el expediente que SÍ viene del borde ──────────────
  it('loads "mi aprendizaje" (SH-4) con lo que devuelve el borde', async () => {
    installMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn(bordeConAprendizaje({ status: 200, body: { enrollments: [matriculaServidor()], paths: [] } })),
    );
    await createComponent();

    component.goToLearning();
    await flushMicrotasks();
    expect(component.view()).toBe('learning');
    expect(component.learningState()).toBe('ok');
    expect(component.enrollments().map((entry) => entry.course.title)).toEqual([
      'Curso que SÍ compró',
    ]);
    // `paths` sale SIEMPRE vacío por decisión del borde, así que la sección no se
    // ofrece: «no existe» no se pinta como «no has empezado ninguna».
    expect(component.paths()).toEqual([]);
    expect(component.accountConfig().sections.map((section) => section.id)).toEqual(['courses']);
  });

  // ── El día es el LOCAL, y lo que el servidor no fecha queda sin fecha ──────────
  //
  // «Hoy» salía de `toISOString().slice(0, 10)`, el día en UTC: desde las 19:00 de Bogotá ya era
  // mañana. Y `new Date('2026-10-03')` es medianoche UTC, que en Bogotá se pinta «2 de octubre».
  // Se fija la zona del sitio (en una máquina en UTC los dos días coinciden y el test no exigiría
  // nada) y, donde hace falta, `Date` a las 22:30 locales; los temporizadores siguen reales.
  describe('el día LOCAL a las 22:30 de Bogotá', () => {
    const entorno = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    let zonaDeLaMaquina: string | undefined;
    beforeEach(() => {
      zonaDeLaMaquina = entorno['TZ'];
      entorno['TZ'] = 'America/Bogota';
    });
    afterEach(() => {
      vi.useRealTimers();
      if (zonaDeLaMaquina === undefined) {
        delete entorno['TZ'];
      } else {
        entorno['TZ'] = zonaDeLaMaquina;
      }
    });

    it('la pregunta de hoy lleva HOY, no el día UTC', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 3, 22, 30) });
      // El control: a esa hora, el día UTC ya es el 4.
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-04');
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      component.questionDraft.set('¿Cómo se configura el router?');
      component.postQuestion();

      expect(component.questions()[0].date).toBe('2026-10-03');
    });

    it('«última actividad» pinta el día que dice el servidor, y sin fecha no se pinta', async () => {
      installMemoryStorage();
      const conFecha = { ...matriculaServidor(), enrollmentId: 'ENR-CON', lastActivityAt: '2026-10-03' };
      const sinFecha: Record<string, unknown> = { ...matriculaServidor(), enrollmentId: 'ENR-SIN' };
      delete sinFecha['lastActivityAt'];
      vi.stubGlobal(
        'fetch',
        vi.fn(bordeConAprendizaje({ status: 200, body: { enrollments: [conFecha, sinFecha], paths: [] } })),
      );
      await createComponent();
      component.goToLearning();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.enrollments().map((entry) => entry.lastActivityAt)).toEqual(['2026-10-03', null]);
      const etiqueta = (fila: number): string => {
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.syn-account__row')[fila].click();
        fixture.detectChanges();
        return (fixture.nativeElement as HTMLElement).querySelector('.academy__progress-label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      };
      expect(etiqueta(0)).toBe('30% · última actividad 3 de octubre de 2026');
      expect(etiqueta(1)).toBe('30%');
    });
  });

  // ══ #102 · EL VACÍO HONESTO, QUE ERA INALCANZABLE ═══════════════════════════

  it('un alumno SIN matrículas ve el vacío honesto, no tres cursos que no compró', async () => {
    installMemoryStorage();
    // La respuesta CORRECTA de un alumno nuevo: dos listas vacías, 200.
    vi.stubGlobal(
      'fetch',
      vi.fn(bordeConAprendizaje({ status: 200, body: { enrollments: [], paths: [] } })),
    );
    await createComponent();

    component.goToLearning();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.learningState()).toBe('ok');
    expect(component.enrollments()).toEqual([]);

    const texto: string = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('Todavía no te has inscrito a ningún curso');
    // Lo que veía el que estrenaba la pantalla: el expediente de ejemplo.
    expect(texto).not.toContain('Ruta Full-Stack Developer');
    expect(texto).not.toContain('Última actividad');
    expect(texto).not.toContain('64%');
  });

  it('sin sesión NO enseña cursos de ejemplo: pide iniciar sesión', async () => {
    installMemoryStorage();
    // El borde toma al alumno de la sesión desde que cerró el IDOR: el anónimo es 401.
    vi.stubGlobal(
      'fetch',
      vi.fn(bordeConAprendizaje({ status: 401, body: { error: 'Se requiere iniciar sesión.' } })),
    );
    await createComponent();

    component.goToLearning();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.learningState()).toBe('anon');
    expect(component.enrollments()).toEqual([]);

    const texto: string = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('Inicia sesión para ver tus cursos');
    // Un invitado que ve cursos de ejemplo cree que tiene matrículas.
    expect(texto).not.toContain('Ruta Full-Stack Developer');
    expect(texto).not.toContain('Todavía no te has inscrito');
    // Y no se le ofrece reintentar: volver a pedirlo no cambia que no hay sesión.
    expect(texto).not.toContain('Actualizar');
  });

  it('el expediente ILEGIBLE no se lee como «no tienes cursos»', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(bordeConAprendizaje({ status: 500, body: { error: 'boom' } })));
    await createComponent();

    component.goToLearning();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.learningState()).toBe('unreadable');

    const texto: string = fixture.nativeElement.textContent ?? '';
    expect(texto).toContain('No pudimos leer tu aprendizaje');
    // Las dos frases que serían MENTIRA: no tienes cursos, y aquí están tres.
    expect(texto).not.toContain('Todavía no te has inscrito');
    expect(texto).not.toContain('Ruta Full-Stack Developer');
  });

  it('no manda el `?student=` que el borde ya ignora', async () => {
    installMemoryStorage();
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(bordeConAprendizaje({ status: 200, body: { enrollments: [], paths: [] } }, urls)),
    );
    await createComponent();

    // El correo TECLEADO en el checkout, que es justo el que se mandaba —mientras el
    // aula escribe el progreso con el del gate—.
    component.studentEmail.set('otro-distinto@example.com');
    component.goToLearning();
    await flushMicrotasks();

    const pedidas = urls.filter((url) => url.includes('/learning'));
    expect(pedidas.length).toBeGreaterThan(0);
    expect(pedidas.every((url) => url.endsWith('/learning'))).toBe(true);
    expect(pedidas.some((url) => url.includes('student='))).toBe(false);
    expect(pedidas.some((url) => url.includes('otro-distinto'))).toBe(false);
    expect(pedidas.some((url) => url.includes('invitado%40synergos.academy'))).toBe(false);
  });

  it('la celda «Alumno» no pinta la sub-línea vacía del correo (#107)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('instructor');
    await flushMicrotasks();
    component.onInstructorSectionChange('students');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.consoleRows().length).toBeGreaterThan(0);
    // En la sección de alumnos ninguna celda tiene sub-línea: la de «course» sólo la
    // pinta con `lessonTitle` (que es de Q&A). Con el `{{ row.email }}` puesto, aquí
    // sale un `<span>` vacío por fila.
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.academy__cell-sub').length).toBe(0);
  });

  // ── instructor console (SH-5): desk loads cursos + alumnos + Q&A ──────────────
  it('loads the SH-5 instructor console with cursos, alumnos and Q&A', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('instructor');
    await flushMicrotasks();
    expect(component.desk()).not.toBeNull();
    expect(component.consoleKpis().length).toBeGreaterThan(0);
    expect(component.consoleRows().length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('/instructor');

    component.onInstructorSectionChange('students');
    expect(component.instructorView()).toBe('students');
    expect(component.consoleColumns()).toBe(component.studentColumns);
  });

  // ── create (SH-6): authoring wizard publishes a course ───────────────────────
  /**
   * Recorre el wizard SH-6 por el DOM y **pulsa «Publicar curso»** — no llama a
   * `onCreatePublished`. Un spec que llama al método no ve que el cuerpo enviado no
   * sea el que el borde exige, ni que la pantalla mienta (reglas 5 y 9).
   */
  async function driveCreateWizard(): Promise<void> {
    component.setRole('instructor');
    fixture.detectChanges();
    await flushMicrotasks();
    component.openCreate();
    fixture.detectChanges();
    await flushMicrotasks();

    const host = fixture.nativeElement as HTMLElement;
    const type = (el: HTMLInputElement | HTMLTextAreaElement | null, value: string): void => {
      if (!el) {
        throw new Error('campo del wizard no encontrado');
      }
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    const advance = async (): Promise<void> => {
      fixture.detectChanges();
      const next = host.querySelector<HTMLButtonElement>('.syn-authoring__btn--primary');
      if (!next || next.disabled) {
        throw new Error(`el paso no deja continuar: "${next?.textContent?.trim() ?? '—'}"`);
      }
      next.click();
      fixture.detectChanges();
      await flushMicrotasks();
    };

    const texts = host.querySelectorAll<HTMLInputElement>('.academy__form input[type="text"]');
    type(texts[0], 'Curso de prueba'); // Título
    type(texts[1], 'Un subtítulo'); // Subtítulo
    type(texts[2], 'Desarrollo'); // Escuela / categoría
    await advance();

    type(host.querySelector<HTMLTextAreaElement>('.academy__textarea'), 'Módulo 1\nMódulo 2');
    await advance();

    type(host.querySelector<HTMLInputElement>('.academy__form input[type="number"]'), '350000');
    await advance();

    // Paso «publicar»: el botón primario ya dice «Publicar curso».
    await advance();
  }

  it('publishes a course through the SH-6 wizard with the body the borde requires', async () => {
    installMemoryStorage();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.method === 'POST' && url.endsWith('/course')) {
          // Lo que responde el borde de verdad: `{ courseId }` — SIN `id`.
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ courseId: 'C-REAL-1' }),
          } as Response);
        }
        return Promise.reject(new Error('offline'));
      }),
    );
    await createComponent();
    await driveCreateWizard();

    const publish = calls.find((call) => call.init?.method === 'POST' && call.url.endsWith('/course'));
    expect(publish, 'el wizard no llegó a publicar').toBeDefined();
    const body = JSON.parse(String(publish!.init!.body)) as Record<string, unknown>;

    // `modules` es una lista de OBJETOS: con cadenas el borde contesta
    // `400 $.modules[0]`, siempre.
    expect(body['modules']).toEqual([
      { title: 'Módulo 1', lessons: [] },
      { title: 'Módulo 2', lessons: [] },
    ]);
    // Y el subtítulo viaja como `summary`, que es como lo llama el borde.
    expect(body['summary']).toBe('Un subtítulo');
    expect(body['title']).toBe('Curso de prueba');

    // El id que se pinta es el del servidor, no uno inventado.
    expect(component.createResultId()).toBe('C-REAL-1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Curso publicado');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('C-REAL-1');
  });

  it('does NOT say «Curso publicado» when the server never confirmed it', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await driveCreateWizard();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(component.createResultId()).toBe('');
    expect(text).not.toContain('Curso publicado');
    expect(text).toContain('No pudimos publicar el curso');
  });

  // ── hash router: deep-links views + the instructor console ────────────────────
  it('deep-links views and the instructor console through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToLearning();
    expect(window.location.hash).toBe('#/academy/mi-aprendizaje');

    component.setRole('instructor');
    expect(window.location.hash).toContain('/instructor');
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ─────────────
  it('degrades to a visible mock catalogue when the courses endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.courses().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── hero copy: the CMS composes it through the `config` JSON ──────────────────
  // The CMS emitter folds every prop into ONE `config` attribute, so a key the
  // sanitizer whitelist forgets is dropped in silence and the hero paints its
  // baked default. This asserts the rendered <h1>/<p>, not the signals: only the
  // DOM proves the value survived sanitize → computed → template.
  it('paints the hero heading and subheading composed by the CMS via `config`', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    fixture.componentRef.setInput('config', { heading: 'X', subheading: 'Y' });
    fixture.detectChanges();

    const title = fixture.debugElement.query(By.css('.academy__hero-title'));
    const sub = fixture.debugElement.query(By.css('.academy__hero-sub'));
    expect(title.nativeElement.textContent.trim()).toBe('X');
    expect(sub.nativeElement.textContent.trim()).toBe('Y');
  });

  // Control: with nothing composed the hero must look EXACTLY as it did before
  // the keys existed — the change is additive, not a copy rewrite.
  // ── opiniones del curso: SH-13 (#28) ─────────────────────────────────────────
  //
  // Educación mostraba nota y conteo y no los podía ganar. Lo que estos casos
  // guardan es lo propio del dominio: los CRITERIOS de un curso y el gate de
  // matrícula — y que un envío contra un endpoint que no existe NO diga «gracias».
  async function abrirCurso(): Promise<void> {
    component.openCourse(component.courses()[0]);
    await flushMicrotasks();
    fixture.detectChanges();
  }

  it('la ficha del curso monta SH-13 con la distribución y los criterios del dominio', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await abrirCurso();

    expect(fixture.nativeElement.querySelector('syn-review-panel')).not.toBeNull();
    // La distribución se PINTA — no existía en ningún dominio.
    expect(fixture.nativeElement.querySelectorAll('.syn-reviews__dist-row').length).toBe(5);

    // Y los criterios son los de un CURSO, no los de un hotel ni los de un producto.
    const criterios = component.courseReviewSummary().criteria?.map((c) => c.id);
    expect(criterios).toEqual(['claridad', 'utilidad', 'ritmo']);
    // Se pregunta exactamente por lo que se muestra: los prompts salen del resumen.
    expect(component.courseReviewPrompts().map((p) => p.id)).toEqual(criterios);
  });

  it('con matrícula se puede opinar, y el envío pide una escala por criterio', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await abrirCurso();

    expect(component.canReviewCourse()).toBe(true);
    expect(component.courseReviewBlocked()).toBeNull();
    // La global más una por criterio.
    expect(fixture.nativeElement.querySelectorAll('fieldset.syn-reviews__field').length).toBe(4);
  });

  it('EL caso: un envío contra un endpoint que no existe NO dice «gracias»', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await abrirCurso();

    await component.submitCourseReview({
      rating: 5,
      title: 'Excelente',
      body: 'Aprendí muchísimo con los proyectos.',
      criteria: { claridad: 5, utilidad: 5, ritmo: 4 },
    });

    // El endpoint de reseñas de Educación todavía no existe. Degradar una
    // ESCRITURA a mock mentiría: le diría a alguien que su opinión está publicada
    // cuando el servidor no recibió nada (regla 4 de CLAUDE.md, #26).
    expect(component.reviewFailed()).toBe(true);
    expect(component.reviewNotice()).not.toContain('publicada');
    expect(component.reviewNotice()).toContain('No pudimos publicar');
  });

  it('sin matrícula no hay formulario, y el mensaje NO ofrece iniciar sesión', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await abrirCurso();

    const detalle = component.detail()!;
    component.detail.set({ ...detalle, canReview: false });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-reviews__form')).toBeNull();
    const aviso = (
      fixture.nativeElement.querySelector('.syn-reviews__blocked')?.textContent ?? ''
    ).toLowerCase();
    expect(aviso).toContain('matriculado');
    // Sin sesión no hay bridge del host en el test, así que el motivo es
    // `not-consumer`: la sesión no es el problema y ofrecer login mandaría a dar
    // vueltas (ADR 0112).
    expect(component.courseReviewBlocked()).toBe('not-consumer');
    expect(aviso).not.toContain('inicia sesión');
  });

  it('falls back to the baked hero copy when the CMS composes nothing', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const title = fixture.debugElement.query(By.css('.academy__hero-title'));
    const sub = fixture.debugElement.query(By.css('.academy__hero-sub'));
    expect(title.nativeElement.textContent.trim()).toBe('Aprende de verdad, a tu ritmo');
    expect(sub.nativeElement.textContent.trim()).toBe(
      'Cursos con proyectos reales, mentoría y certificado verificable.',
    );
  });

  // ── moderación: el acuse y la cola (#31) ─────────────────────────────────────
  describe('moderación', () => {
    it('EL caso: un 202 dice «en revisión», no «publicada», y no recarga', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.openCourse(component.courses()[0]);
      await flushMicrotasks();
      const courseId = component.detail()!.course.id;

      const llamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          llamadas.push(String(url));
          return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await component.submitCourseReview({
        rating: 5,
        title: 'Excelente',
        body: 'Los proyectos son reales y el ritmo se sostiene hasta el final.',
        criteria: {},
      });

      expect(component.reviewNotice()).toContain('en revisión');
      expect(component.reviewNotice()).not.toContain('publicada');
      expect(llamadas.filter((u) => u.includes(`/course/${courseId}`))).toEqual([]);
    });

    it('EL caso: las REPORTADAS van primero, y entre ellas la más reportada', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('instructor');
      await flushMicrotasks();

      const cola = component.moderationQueue();
      expect(cola.length).toBeGreaterThan(2);
      // Una reportada ya está pública haciendo daño; una pendiente no la ve nadie.
      // El mock llega con la PENDIENTE primero, así que esto sólo pasa si el orden
      // se aplica de verdad.
      expect(cola.map((i) => i.reason)).toEqual(['reported', 'reported', 'pending']);
      // Y entre reportadas, primero la que más gente reportó.
      expect(cola[0].reportCount).toBeGreaterThan(cola[1].reportCount);
      // La segunda reportada llega con conteo 0 —el servidor no lo mandó— y aun
      // así va por delante de la pendiente. Sin esta fila, ordenar sólo por
      // conteo daría el mismo resultado y la regla del motivo no se vigilaría.
      expect(cola[1].reportCount).toBe(0);
    });

    it('la cola es una sección de la consola con su badge', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('instructor');
      await flushMicrotasks();
      fixture.detectChanges();

      const seccion = component
        .consoleConfig()
        .sections.find((s) => s.id === 'moderation');
      expect(seccion).toBeTruthy();
      expect(seccion?.badge).toBe(component.moderationQueue().length);
    });

    it('EL caso: la fila NO sale de la cola si el servidor no lo confirmó', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('instructor');
      await flushMicrotasks();

      const antes = component.moderationQueue().length;
      const objetivo = component.moderationQueue()[0].id;

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
        ),
      );
      await component.decideModeration(objetivo, 'reject');

      // Sigue ahí: quitarla y que el POST falle dejaría la opinión publicada con el
      // docente creyendo que la atendió.
      expect(component.moderationQueue()).toHaveLength(antes);
      expect(component.moderationFailed()).toBe(true);
      expect(component.moderationNotice()).toContain('sigue como estaba');
    });

    it('aprobar la saca de la cola y lo dice', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('instructor');
      await flushMicrotasks();

      const antes = component.moderationQueue().length;
      const objetivo = component.moderationQueue()[0].id;

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
        ),
      );
      await component.decideModeration(objetivo, 'approve');

      expect(component.moderationQueue()).toHaveLength(antes - 1);
      expect(component.moderationFailed()).toBe(false);
      expect(component.moderationNotice()).toContain('aprobada');
    });

    it('«ya decidida» la saca igual: pulsar sobre algo resuelto no sirve', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('instructor');
      await flushMicrotasks();

      const antes = component.moderationQueue().length;
      const objetivo = component.moderationQueue()[0].id;

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) } as Response),
        ),
      );
      await component.decideModeration(objetivo, 'approve');

      expect(component.moderationQueue()).toHaveLength(antes - 1);
      expect(component.moderationFailed()).toBe(false);
      expect(component.moderationNotice()).toContain('ya la había atendido');
    });
  });

  // ── SH-14 comparar (#30) ─────────────────────────────────────────────────────
  //
  // Se PULSA el botón, y además hay un motivo extra para hacerlo acá: la tarjeta
  // lleva un «stretched link» cuyo ::after cubre todo. Un spec que llamara al
  // método pasaría en verde aunque el velo se comiera el clic, que es el fallo
  // silencioso que este caso existe para cazar.
  it('marca dos cursos desde el catálogo y la tabla alinea el compromiso', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const botones = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.academy__cmp'),
      ) as HTMLButtonElement[];

    expect(botones().length).toBeGreaterThan(1);
    botones()[0].click();
    botones()[1].click();
    fixture.detectChanges();

    expect(component.compare.count()).toBe(2);
    // Y marcar NO abrió el curso: si el velo se hubiera comido el clic, la vista
    // habría cambiado a 'course'.
    expect(component.view()).toBe('catalog');

    const filas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
    ).map((el) => el.textContent?.trim());
    expect(filas).toContain('Duración');
    expect(filas).toContain('Nivel');
  });
});

describe('AcademyApiClient', () => {
  function createClient(): AcademyApiClient {
    TestBed.configureTestingModule({ providers: [AcademyApiClient] });
    return TestBed.inject(AcademyApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('una matrícula sin `lastActivityAt` y un certificado sin `issuedAt` quedan sin fecha', async () => {
    const responder = (body: unknown): Promise<Response> =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    const sinFecha = matriculaServidor();
    delete sinFecha['lastActivityAt'];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/learning')
          ? responder({ enrollments: [sinFecha], paths: [] })
          : responder({ id: 'CERT-1', studentName: 'Ada', courseTitle: 'Angular', verifyUrl: 'https://synergos.test/v/CERT-1' }),
      ),
    );
    const client = createClient();

    const aprendizaje = await client.learning('/api/academy', 'COP');
    expect(aprendizaje.status === 'ok' ? aprendizaje.enrollments[0].lastActivityAt : 'sin lectura').toBeNull();
    expect((await client.certificate('/api/academy', 'C-1'))?.issuedAt).toBeNull();
  });

  it('`canReview` ausente significa NO, no «sí» (default seguro, #28)', async () => {
    const client = createClient();
    // Una respuesta viva que trae el curso y NO habla de permisos.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: { id: 'C-1', title: 'Curso', amount: 100, currency: 'COP' },
              description: 'desc',
            }),
        } as Response),
      ),
    );

    const detalle = await client.course('/api/academy', 'C-1', 'COP');

    // Ofrecer el formulario a quien el servidor no autorizó es prometer algo que
    // va a rebotar con 403: el default tiene que ser el restrictivo.
    expect(detalle.canReview).toBe(false);
    expect(detalle.reviews).toEqual([]);
    expect(detalle.reviewSummary).toBeNull();
  });

  it('normalises a live courses response with derived facets (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              courses: [
                { id: 'X1', title: 'Curso X', category: 'Datos', level: 'beginner', amount: 100_000, currency: 'COP' },
              ],
              total: 1,
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.courses(
      '/api/academy',
      { q: '', category: '', level: '', price: '', sort: 'relevance' },
      'COP',
    );

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].id).toBe('X1');
    expect(result.facets.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(false);
  });

  it('reads the REAL credential out of the borde envelope `{ certificate }`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            // La forma que emite `CertificateResponse`: la credencial va ANIDADA.
            Promise.resolve({
              certificate: {
                id: 'CERT-SELLADO-1',
                studentName: 'Ada Lovelace',
                courseTitle: 'Angular',
                issuedAt: '2026-05-04T00:00:00Z',
                verifyUrl: 'https://synergos.test/academy/verify/CERT-SELLADO-1',
              },
            }),
        } as Response),
      ),
    );
    const client = createClient();

    const cert = await client.certificate('/api/academy', 'C1');
    expect(client.degraded).toBe(false);
    expect(cert?.id).toBe('CERT-SELLADO-1');
    expect(cert?.verifyUrl).toBe('https://synergos.test/academy/verify/CERT-SELLADO-1');
  });

  it('NEVER fabricates a credential — a failed certificate read is null', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    // Un catálogo de ejemplo es una demo; una credencial de ejemplo es una prueba
    // falsa: se imprime igual que una real y viaja sin el cartel de la página.
    expect(await client.certificate('/api/academy', 'C1')).toBeNull();
    expect(client.degraded).toBe(true);
  });

  it('treats a credential with no verify URL as no credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ certificate: { id: 'CERT-SIN-URL', studentName: 'Ada' } }),
        } as Response),
      ),
    );
    const client = createClient();

    // Había un fallback que INVENTABA la URL a partir del id. Una credencial que no
    // se puede verificar, pintada con el sello «Verificable», no es un dato
    // incompleto: es una prueba falsa.
    expect(await client.certificate('/api/academy', 'C1')).toBeNull();
  });

  it('«más recientes» del catálogo de ejemplo ordena por FECHA, no al revés', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.courses(
      '/api/academy',
      { q: '', category: '', level: '', price: '', sort: 'newest' },
      'COP',
    );

    // La regla del servidor: fecha desc · empate por título · «no consta» al final.
    // `copy.reverse()` daba [6,5,4,3,2,1] — un orden que no es el que el desplegable
    // promete, o sea un mock que describe un servidor que no existe (regla 10).
    expect(result.courses.map((course) => course.id)).toEqual([
      'CMOCK-6', // 2026-07-18, empata con CMOCK-2 y gana por título
      'CMOCK-2', // 2026-07-18
      'CMOCK-1', // 2026-05-10
      'CMOCK-4', // 2026-03-02
      'CMOCK-3', // 2026-02-02
      'CMOCK-5', // sin fecha → al final
    ]);
  });

  it('un curso SIN `status` no se da por publicado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              instructor: 'yo',
              courses: [{ id: 'C-SIN-ESTADO', title: 'Borrador a medias' }],
              students: [],
              questions: [],
            }),
        } as Response),
      ),
    );
    const client = createClient();

    const desk = await client.instructorDesk('/api/academy', 'yo');
    // Resolvía `'published'`: la ausencia AFIRMABA, y quien escribió el borrador lo
    // veía publicado en su propia consola.
    expect(desk.courses[0].status).toBeNull();
  });

  it('una matrícula de ESTA sesión se pliega sobre el expediente leído', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(bordeConAprendizaje({ status: 200, body: { enrollments: [matriculaServidor()], paths: [] } })),
    );
    const client = createClient();

    client.recordEnrollment({
      enrollmentId: 'ENR-NEW',
      course: {
        id: 'CNEW',
        title: 'Nuevo Curso',
        subtitle: '',
        amount: 0,
        currency: 'COP',
        category: 'Desarrollo',
        level: 'beginner',
        durationMinutes: 60,
        lessonCount: 5,
        rating: 0,
        studentCount: 0,
        instructorName: 'Yo',
        cover: '',
        badges: [],
      },
      percent: 0,
      lessonCount: 5,
      completedCount: 0,
      lastActivityAt: '2026-07-06',
      completed: false,
    });

    const learning = await client.learning('/api/academy', 'COP');
    expect(learning.status).toBe('ok');
    // La matrícula de esta sesión ya la acusó el borde (`enroll` devolvió su id): va
    // arriba, y el expediente leído detrás. Nada de esto es inventado.
    expect(learning.status === 'ok' && learning.enrollments.map((entry) => entry.course.id)).toEqual([
      'CNEW',
      'C-SERVIDOR',
    ]);
  });

  it('dos listas vacías son una RESPUESTA, no un fallo — y no traen mock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(bordeConAprendizaje({ status: 200, body: { enrollments: [], paths: [] } })),
    );
    const client = createClient();

    const learning = await client.learning('/api/academy', 'COP');
    expect(learning.status).toBe('ok');
    expect(learning.status === 'ok' && learning.enrollments).toEqual([]);
    // Y no enciende el cartel de «datos de ejemplo»: no hay ninguno.
    expect(client.degraded).toBe(false);
  });

  it('un 401 es `anon` y un 500 es `unreadable` — no son la misma pantalla', async () => {
    vi.stubGlobal('fetch', vi.fn(bordeConAprendizaje({ status: 401 })));
    let client = createClient();
    expect((await client.learning('/api/academy', 'COP')).status).toBe('anon');

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(bordeConAprendizaje({ status: 500 })));
    client = createClient();
    expect((await client.learning('/api/academy', 'COP')).status).toBe('unreadable');

    // Y una respuesta 200 que NO tiene la forma del contrato tampoco se lee como
    // «no tienes cursos»: no se sabe qué contestó el servidor.
    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(bordeConAprendizaje({ status: 200, body: { algo: 'otra cosa' } })));
    client = createClient();
    expect((await client.learning('/api/academy', 'COP')).status).toBe('unreadable');
  });

  it('reads the published course id from `courseId`, which is what the borde answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          // El borde responde `{ courseId }` y NO trae `id`: leyendo `id` esto caía
          // al mock incluso con un 200 en la mano.
          json: () => Promise.resolve({ courseId: 'C-REAL-1' }),
        } as Response),
      ),
    );
    const client = createClient();

    const result = await client.createCourse(
      '/api/academy',
      { title: 'Nuevo', subtitle: '', category: 'Datos', level: 'beginner', price: 200_000, modules: ['M1'] },
      'COP',
    );
    // Sin `status`: `PublishCourseResponse` emite `{ courseId }` y nada más, así que
    // el `'published'` que salía aquí lo ponía el normalizador, no el borde.
    expect(result).toEqual({ id: 'C-REAL-1', persisted: true });
    expect(client.degraded).toBe(false);
  });

  it('a failed publish invents NOTHING — no id, and no course seeded in the console', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.createCourse(
      '/api/academy',
      { title: 'Nuevo', subtitle: '', category: 'Datos', level: 'beginner', price: 200_000, modules: ['M1'] },
      'COP',
    );
    expect(result.persisted).toBe(false);
    expect(result.id).toBe('');

    // Sembrarlo en la consola era enseñar la prueba de la mentira en la pantalla de
    // al lado: el instructor volvía a «mis cursos» y ahí estaba.
    const desk = await client.instructorDesk('/api/academy', 'instructor');
    expect(client.degraded).toBe(true);
    expect(desk.courses.some((course) => course.title === 'Nuevo')).toBe(false);
    expect(desk.questions.length).toBeGreaterThan(0);
  });
});

// ══ LA MATRÍCULA POR LA PUERTA (010-educacion-matricula, ADR 0140) ═════════════════════════════════
//
// La academia se matricula por el `<synergos-flujo flujo="educacion.matricula">` que coloca la vista, con el
// envoltorio GENERADO del flujo: abrir autoriza, cerrar captura y avisa, y después el CMS anota la matrícula en el
// libro que abre el aula. Lo que se mira es lo que viajó a la puerta —la llave del curso, el curso con su clase, el
// plan— y lo que el SERVIDOR contestó, nunca un comprobante del navegador.

type OperacionDeLaMatricula = 'cotizar' | 'abrir' | 'cerrar' | 'cancelar' | 'consultar';

interface GuionDeLaMatricula {
  /** El total que dice el servidor, en unidades MAYORES. */
  readonly total?: number;
  readonly rechazos?: Partial<Record<OperacionDeLaMatricula, { readonly code: string; readonly status?: number }>>;
  /** Si el CMS no consigue anotar la matrícula cerrada. */
  readonly anotarCaido?: boolean;
  /** El plan con el que vuelve la PRIMERA apertura (otra pestaña abrió con otro). */
  readonly planAbierto?: string | null;
  /** La ficha que sirve el CMS en `GET …/course/{id}`; sin ella, cae a la muestra. */
  readonly ficha?: (id: string) => unknown;
  /** Una matrícula que ya existe antes de la página (la del enlace del aviso): su estado y su curso. */
  readonly existente?: { readonly estado: string; readonly cursoId: string };
}

interface PedidoALaMatricula {
  readonly operacion: string;
  readonly url: string;
  readonly llave: string | null;
  readonly cuerpo: { curso?: { kind: string; id: string }; plan?: string | null } | null;
}

/** La puerta de la matrícula y la ruta del CMS que la anota; lo demás cae (el catálogo tiene su muestra). */
function puertaDeLaMatricula(guion: GuionDeLaMatricula = {}) {
  const pedidos: PedidoALaMatricula[] = [];
  const rutas: string[] = [];
  const anotadas: string[] = [];
  let estado = guion.existente?.estado ?? 'Running';
  let plan: string | null = null;
  let curso = { kind: 'educacion.curso', id: guion.existente?.cursoId ?? '' };
  let intento = 0;
  const total = { amount: guion.total ?? 180_000, currency: 'COP' };
  const json = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const matricula = () => ({
    id: `mat-${intento}`,
    flujo: 'educacion.matricula',
    numero: `EDU-000${intento}`,
    estado,
    datos: { curso, plan, total },
    compensacionesPendientes: 0,
    error: null,
    deshaciendo: false,
  });
  const fetchDoble = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
    const ruta = String(url);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    rutas.push(`${metodo} ${ruta}`);
    const anotar = /\/api\/academy\/puerta\/([^/]+)\/anotar/.exec(ruta);
    if (anotar) {
      anotadas.push(decodeURIComponent(anotar[1]));
      return guion.anotarCaido
        ? json(503, { code: 'academy.orquestador_no_disponible', transient: true, title: 'Service Unavailable' })
        : json(200, { enrollmentId: 'ENR-PUERTA-1', courseId: curso.id, yaEstaba: false });
    }
    const ficha = /\/course\/([^/?]+)/.exec(ruta);
    if (ficha && guion.ficha) {
      return json(200, guion.ficha(decodeURIComponent(ficha[1])));
    }
    const m = /\/api\/flujos\/educacion\.matricula\/([a-z]+)/.exec(ruta);
    if (!m) {
      return Promise.reject(new Error('offline'));
    }
    const operacion = m[1] as OperacionDeLaMatricula;
    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as PedidoALaMatricula['cuerpo']) : null;
    pedidos.push({ operacion, url: ruta, llave: new Headers(init?.headers).get('Idempotency-Key'), cuerpo });
    if (cuerpo?.curso) curso = cuerpo.curso;
    const rechazo = guion.rechazos?.[operacion];
    if (rechazo) {
      const status = rechazo.status ?? 409;
      return json(status, { code: rechazo.code, detail: 'guionado', title: 'Conflict', transient: status >= 500 });
    }
    switch (operacion) {
      case 'cotizar':
        return json(200, { flujo: 'educacion.matricula', datos: { curso, plan: cuerpo?.plan ?? null, total } });
      case 'abrir':
        if (intento === 0 || estado === 'Compensated') {
          intento += 1;
          estado = 'Running';
          plan = intento === 1 && guion.planAbierto !== undefined ? guion.planAbierto : (cuerpo?.plan ?? null);
        }
        return json(201, matricula());
      case 'cerrar':
        estado = 'Completed';
        return json(200, matricula());
      case 'cancelar':
        if (estado === 'Running') estado = 'Compensated';
        return json(200, matricula());
      default:
        return json(200, matricula());
    }
  });
  return {
    fetchDoble,
    pedidos,
    anotadas,
    veces: (operacion: OperacionDeLaMatricula) => pedidos.filter((p) => p.operacion === operacion).length,
    directas: () => rutas.filter((r) => r.startsWith('POST') && (r.includes('/api/academy/enroll') || r.includes('/api/academy/confirm'))).length,
    alaPuerta: () => rutas.filter((r) => r.includes('/api/flujos')).length,
  };
}

/** Lo que el CMS manda cuando el sitio declara la puerta para la matrícula. */
const POR_LA_PUERTA = { ...NEGOCIO_DEL_CMS, enrollmentPath: 'puerta' };

describe('La matrícula por la puerta (010-educacion-matricula)', () => {
  let fixture: ComponentFixture<AcademyElementComponent>;
  let component: AcademyElementComponent;

  beforeAll(() => definirCoordinador());

  async function montar(puerta: ReturnType<typeof puertaDeLaMatricula>, config: object = POR_LA_PUERTA): Promise<void> {
    window.location.hash = '';
    installMemoryStorage();
    vi.stubGlobal('fetch', puerta.fetchDoble);
    await TestBed.configureTestingModule({
      imports: [AcademyElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        AcademyApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: AcademyFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AcademyElementComponent);
    component = fixture.componentInstance;
    // Como lo coloca el CMS: dentro de su <synergos-flujo>, que la matrícula encuentra por ancestro.
    const flujo = document.createElement('synergos-flujo');
    flujo.setAttribute('flujo', 'educacion.matricula');
    document.body.appendChild(flujo);
    flujo.appendChild(fixture.nativeElement as HTMLElement);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await flushMicrotasks();
  }

  afterEach(() => {
    document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
    window.history.replaceState({}, '', '/');
    window.location.hash = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function asistente(): CheckoutWizardComponent {
    return fixture.debugElement.query(By.directive(CheckoutWizardComponent)).componentInstance as CheckoutWizardComponent;
  }

  /** Abre el curso de pago, elige un plan y llega al último paso del asistente. */
  async function hastaElUltimoPaso(plan?: string): Promise<void> {
    component.openCourse(component.courses().find((c) => c.amount > 0)!);
    await flushMicrotasks();
    if (plan) {
      component.selectPlan(component.detail()!.plans.find((p) => p.id === plan)!);
    }
    component.studentName.set('Ada Lovelace');
    component.studentEmail.set('ada@example.com');
    component.startEnrollment();
    await flushMicrotasks();
    fixture.detectChanges();
    const wizard = asistente();
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
  }

  async function pagar(): Promise<void> {
    asistente().next(); // submit → pay (abrir) → confirm (cerrar y anotar)
    await flushMicrotasks(40);
    fixture.detectChanges();
  }

  /** Los avisos que se VEN (párrafos con los colores de la academia), no los que sólo se anuncian. */
  function avisosVisibles(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.academy__mod-notice'))
      .map((nodo) => (nodo.textContent ?? '').trim())
      .filter((texto) => texto !== '');
  }

  function alertas(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"], [role="status"], syn-live-region'))
      .map((nodo) => (nodo.textContent ?? '').trim())
      .filter((texto) => texto !== '');
  }

  it('«puerta»: abre con la llave del curso y el curso con su clase, cierra por su id y el CMS la anota; ni una llamada a /enroll ni a /confirm', async () => {
    const puerta = puertaDeLaMatricula();
    await montar(puerta);
    await hastaElUltimoPaso();
    const cursoId = component.detail()!.course.id;
    const planId = component.selectedPlan()?.id ?? '';

    await pagar();

    const abrir = puerta.pedidos.find((p) => p.operacion === 'abrir')!;
    expect(abrir.llave).toBe(llaveDeLaMatricula(cursoId));
    expect(abrir.cuerpo).toEqual(entradaDeLaMatricula(cursoId, planId));
    expect(puerta.pedidos.find((p) => p.operacion === 'cerrar')!.url).toContain('id=mat-1');
    expect(puerta.anotadas).toEqual(['mat-1']);
    expect(puerta.directas()).toBe(0);
    expect(component.view()).toBe('enrolled');
    // El id es el que anotó el CMS en el libro del aula, no uno del navegador.
    expect(component.enrollmentId()).toBe('ENR-PUERTA-1');
  });

  it('un curso gratis por la puerta abre, cierra y se anota sin pasar por el asistente', async () => {
    const puerta = puertaDeLaMatricula({ total: 0 });
    await montar(puerta);
    component.openCourse(component.courses().find((c) => c.amount <= 0)!);
    await flushMicrotasks();

    component.startEnrollment();
    await flushMicrotasks(40);

    expect(puerta.veces('abrir')).toBe(1);
    expect(puerta.veces('cerrar')).toBe(1);
    expect(puerta.anotadas).toEqual(['mat-1']);
    expect(puerta.directas()).toBe(0);
    expect(component.enrollmentId()).toBe('ENR-PUERTA-1');
  });

  it('sin sesión la puerta dice que hay que iniciarla, y no se anota nada', async () => {
    const puerta = puertaDeLaMatricula({ rechazos: { abrir: { code: 'puerta.sesion_requerida', status: 401 } } });
    await montar(puerta);
    await hastaElUltimoPaso();

    await pagar();

    expect(component.enrollmentId()).toBe('');
    expect(puerta.anotadas).toEqual([]);
    expect(alertas()).toContain('Inicia sesión para matricularte.');
  });

  it('un 503 de la puerta NO cae a la ruta directa: dice que la matrícula en línea no está disponible', async () => {
    const puerta = puertaDeLaMatricula({ rechazos: { abrir: { code: 'puerta.flujo_no_disponible', status: 503 } } });
    await montar(puerta);
    await hastaElUltimoPaso();

    await pagar();

    expect(puerta.directas()).toBe(0);
    expect(component.enrollmentId()).toBe('');
    expect(alertas()).toContain('Este curso no admite matrícula en línea ahora.');
  });

  it('si cerrar llegó y el CMS no la anotó, NO dice «activa»: dice que el pago quedó y que abre el aula', async () => {
    const puerta = puertaDeLaMatricula({ anotarCaido: true });
    await montar(puerta);
    await hastaElUltimoPaso();

    await pagar();

    expect(puerta.veces('cerrar')).toBe(1);
    expect(component.view()).not.toBe('enrolled');
    expect(component.enrollmentId()).toBe('');
    expect(alertas()).toContain(mensajeDeLaMatricula(RAZON_ACTIVANDO));
  });

  it('una matrícula abierta con OTRO plan se cancela antes de abrir la del plan elegido: un solo cobro, el del plan que se muestra', async () => {
    const puerta = puertaDeLaMatricula({ planAbierto: 'otro-plan' });
    await montar(puerta);
    await hastaElUltimoPaso();
    const planId = component.selectedPlan()?.id ?? '';

    await pagar();

    expect(puerta.veces('abrir')).toBe(2);
    expect(puerta.veces('cancelar')).toBe(1);
    expect(puerta.pedidos.find((p) => p.operacion === 'cancelar')!.url).toContain('id=mat-1');
    expect(puerta.pedidos.filter((p) => p.operacion === 'abrir').map((p) => p.cuerpo?.plan ?? null)).toEqual([planId || null, planId || null]);
    expect(puerta.anotadas).toEqual(['mat-2']);
  });

  it('una matrícula que salió por la puerta se TERMINA por la puerta aunque la página pase a declarar la directa', async () => {
    const puerta = puertaDeLaMatricula({ anotarCaido: true });
    await montar(puerta);
    await hastaElUltimoPaso();
    await pagar();
    expect(puerta.veces('cerrar')).toBe(1);

    fixture.componentRef.setInput('config', { ...POR_LA_PUERTA, enrollmentPath: 'directa' });
    fixture.detectChanges();
    await flushMicrotasks();
    await pagar();

    expect(puerta.veces('cerrar')).toBe(2);
    expect(puerta.directas()).toBe(0);
  });

  it('«directa» (o sin declarar): ni una petición a /api/flujos; matricula por /api/academy/enroll como siempre', async () => {
    for (const config of [{ ...POR_LA_PUERTA, enrollmentPath: 'directa' }, NEGOCIO_DEL_CMS]) {
      const puerta = puertaDeLaMatricula();
      await montar(puerta, config);
      expect(component.caminoDeLaMatricula()).toBe('directa');
      await hastaElUltimoPaso();
      await pagar();

      expect(puerta.alaPuerta()).toBe(0);
      expect(puerta.directas()).toBeGreaterThan(0);
      document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
      vi.unstubAllGlobals();
      TestBed.resetTestingModule();
    }
  });

  it('con el curso ya activo en «mi aprendizaje», la ficha ofrece el aula y no otra matrícula (FR-014)', async () => {
    const puerta = puertaDeLaMatricula();
    await montar(puerta);
    component.openCourse(component.courses().find((c) => c.amount > 0)!);
    await flushMicrotasks();
    const curso = component.detail()!.course;
    component.learning.set({
      status: 'ok',
      enrollments: [{ enrollmentId: 'ENR-YA', course: curso, percent: 20, lessonCount: 5, completedCount: 1, lastActivityAt: '2026-10-01', completed: false }],
      paths: [],
    } as never);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(component.matriculaDelCurso()?.enrollmentId).toBe('ENR-YA');
    expect(texto).toContain('Ya estás matriculado en este curso.');
    expect(texto).toContain('Ir al aula');
    expect(texto).not.toContain('Inscribirme');
  });

  it('la ficha no promete cuotas que nadie cobra en cuotas (lote 8, 010-P1 A), por los dos caminos', async () => {
    for (const config of [POR_LA_PUERTA, NEGOCIO_DEL_CMS]) {
      await montar(puertaDeLaMatricula(), config);
      component.openCourse(component.courses().find((c) => c.amount > 0)!);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(component.detail()!.plans.some((p) => !!p.installments)).toBe(true);

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelectorAll('.academy__plan-inst').length).toBe(0);
      expect(raiz.querySelector('.academy__plans')?.textContent ?? '').not.toMatch(/\d+\s*x\s*\$/);
      document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
      vi.unstubAllGlobals();
      TestBed.resetTestingModule();
    }
  });

  describe('el enlace del aviso (?matricula={id}, FR-015)', () => {
    const ficha = (id: string) => ({
      course: { id, title: 'Gestión ágil', amount: 320000, currency: 'COP' },
      plans: [{ id: 'full', label: 'Pago de contado', amount: 320000, installmentCount: 1 }],
    });

    it('una matrícula cerrada se anota en el libro y abre la ficha de su curso', async () => {
      window.history.replaceState({}, '', '/?matricula=mat-7');
      const puerta = puertaDeLaMatricula({ ficha, existente: { estado: 'Completed', cursoId: 'gestion-agil' } });

      await montar(puerta);
      await flushMicrotasks(20);

      expect(puerta.pedidos.find((p) => p.operacion === 'consultar')!.url).toContain('id=mat-7');
      expect(puerta.anotadas).toEqual(['mat-7']);
      expect(component.view()).toBe('course');
      expect(component.detail()?.course.id).toBe('gestion-agil');
    });

    it('una abierta o deshecha NO se anota: abre la ficha para retomarla con la misma llave', async () => {
      for (const estado of ['Running', 'Compensated']) {
        window.history.replaceState({}, '', '/?matricula=mat-7');
        const puerta = puertaDeLaMatricula({ ficha, existente: { estado, cursoId: 'gestion-agil' } });

        await montar(puerta);
        await flushMicrotasks(20);

        expect(puerta.anotadas).toEqual([]);
        expect(component.detail()?.course.id).toBe('gestion-agil');
        expect(component.avisoDeLaMatricula()).toBe('');
        document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
        vi.unstubAllGlobals();
        TestBed.resetTestingModule();
      }
    });

    it('una ajena o que no existe se dice por su code, sin anotar nada', async () => {
      window.history.replaceState({}, '', '/?matricula=mat-ajena');
      const puerta = puertaDeLaMatricula({ rechazos: { consultar: { code: 'educacion.saga_not_found', status: 404 } } });

      await montar(puerta);
      await flushMicrotasks(20);
      fixture.detectChanges();

      expect(puerta.anotadas).toEqual([]);
      expect(component.avisoDeLaMatricula()).toBe('No encontramos esa matrícula.');
      // Y SE VE aunque no haya ficha abierta (hallado en vivo: la región vivía dentro de la ficha).
      await flushMicrotasks(5);
      fixture.detectChanges();
      expect(component.view()).toBe('catalog');
      expect(avisosVisibles()).toContain('No encontramos esa matrícula.');
    });

    it('sin sesión el enlace dice que hay que iniciarla, en el catálogo, sin anotar nada', async () => {
      window.history.replaceState({}, '', '/?matricula=mat-7');
      const puerta = puertaDeLaMatricula({ rechazos: { consultar: { code: 'puerta.sesion_requerida', status: 401 } } });

      await montar(puerta);
      await flushMicrotasks(20);
      fixture.detectChanges();

      expect(puerta.anotadas).toEqual([]);
      expect(avisosVisibles()).toContain('Inicia sesión para matricularte.');
    });
  });

  it('la ficha no ofrece el plan en cuotas aunque venga recomendado: sólo el de contado, por los dos caminos (D-010-P1)', async () => {
    // Lo que sirve el CMS con las reglas de precio de hoy: contado y «3 cuotas» con su recargo del 8 %.
    const ficha = (id: string) => ({
      course: { id, title: 'Gestión ágil', amount: 320000, currency: 'COP' },
      plans: [
        { id: 'full', label: 'Pago de contado', amount: 320000, installments: '', installmentCount: 1 },
        { id: 'emi-3', label: '3 cuotas', amount: 345600, installments: '3 x $115.200', installmentCount: 3, featured: true },
      ],
    });
    for (const config of [POR_LA_PUERTA, NEGOCIO_DEL_CMS]) {
      await montar(puertaDeLaMatricula({ ficha }), config);
      component.openCourse(component.courses().find((c) => c.amount > 0)!);
      await flushMicrotasks();
      fixture.detectChanges();

      // El dato sigue entero (superset); lo que cambia es lo que se ofrece.
      expect(component.detail()!.plans.map((p) => p.id)).toEqual(['full', 'emi-3']);
      expect(component.planesOfrecidos().map((p) => p.id)).toEqual(['full']);
      expect(component.selectedPlan()?.id).toBe('full');
      const planes = (fixture.nativeElement as HTMLElement).querySelector('.academy__plans');
      expect(planes?.querySelectorAll('.academy__plan').length).toBe(1);
      expect(planes?.textContent ?? '').not.toContain('3 cuotas');
      document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
      vi.unstubAllGlobals();
      TestBed.resetTestingModule();
    }
  });

  // ── La devolución del personal (lote 8, 010-P2 B, T035 y T036) ─────────────────────────

  it('tras una devolución, la matrícula nueva abre con la llave numerada que entrega «mi aprendizaje» (T035)', async () => {
    const puerta = puertaDeLaMatricula();
    await montar(puerta);
    await hastaElUltimoPaso();
    const cursoId = component.detail()!.course.id;
    component.learning.set({ status: 'ok', enrollments: [], paths: [], devueltas: { [cursoId]: 1 } });
    fixture.detectChanges();

    await pagar();

    expect(puerta.pedidos.find((p) => p.operacion === 'abrir')!.llave).toBe(llaveDeLaMatricula(cursoId, 1));
    expect(puerta.anotadas).toEqual(['mat-1']);
  });

  /** La consola de un admin con dos alumnos: Ana salió por la puerta con cobro (devolvible), Beto no. */
  function consolaConDevolvible(guion: { devolverFalla?: boolean } = {}) {
    const pedidos: { url: string; cuerpo: unknown }[] = [];
    let devuelta = false;
    const json = (status: number, body: unknown): Promise<Response> =>
      Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
    const fetchDoble = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      const ruta = String(url);
      if (ruta.includes('/instructor/devolver')) {
        pedidos.push({ url: ruta, cuerpo: JSON.parse(String(init?.body ?? 'null')) });
        if (guion.devolverFalla) {
          return json(409, { code: 'payments.refund_over_captured', transient: false, title: 'Conflict' });
        }
        devuelta = true;
        return json(200, { matricula: 'mat-ana', devuelto: 320000, moneda: 'COP' });
      }
      if (ruta.includes('/instructor/courses')) {
        const ana = { id: 'ana-op', name: 'Ana Rincón', courseId: 'gestion-agil', courseTitle: 'Gestión ágil', percent: 40, enrolledAt: '2026-10-20', matriculaDevolvible: 'mat-ana' };
        const beto = { id: 'beto-op', name: 'Beto Salas', courseId: 'gestion-agil', courseTitle: 'Gestión ágil', percent: 10, enrolledAt: '2026-10-21' };
        return json(200, { courses: [], students: devuelta ? [beto] : [ana, beto], questions: [], currency: 'COP' });
      }
      return Promise.reject(new Error('offline'));
    });
    return { fetchDoble, pedidos } as unknown as ReturnType<typeof puertaDeLaMatricula> & { pedidos: typeof pedidos };
  }

  async function aLosAlumnos(): Promise<HTMLElement> {
    component.setRole('instructor');
    await flushMicrotasks();
    component.onInstructorSectionChange('students');
    await flushMicrotasks();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botonesDevolver(raiz: HTMLElement): HTMLButtonElement[] {
    return Array.from(raiz.querySelectorAll<HTMLButtonElement>('button.academy__btn--sm'))
      .filter((b) => ['Devolver', 'Confirmar devolución'].includes((b.textContent ?? '').trim()));
  }

  it('la consola ofrece «Devolver» sólo en la fila que el servidor marca, y pide confirmar antes de devolver (T036)', async () => {
    const consola = consolaConDevolvible();
    await montar(consola);
    const raiz = await aLosAlumnos();

    expect(component.consoleColumns().map((c) => c.key)).toContain('devolver');
    expect(botonesDevolver(raiz)).toHaveLength(1);

    botonesDevolver(raiz)[0].click();
    await flushMicrotasks();
    fixture.detectChanges();
    expect(consola.pedidos).toHaveLength(0);
    expect((botonesDevolver(raiz)[0].textContent ?? '').trim()).toBe('Confirmar devolución');

    botonesDevolver(raiz)[0].click();
    await flushMicrotasks(20);
    fixture.detectChanges();

    expect(consola.pedidos).toEqual([{ url: expect.stringContaining('/instructor/devolver'), cuerpo: { matricula: 'mat-ana' } }]);
    expect(component.avisoDeLaDevolucion()).toContain('Matrícula devuelta. Reembolso:');
    expect(avisosVisibles().some((t) => t.startsWith('Matrícula devuelta. Reembolso:'))).toBe(true);
    // Devuelta, la fila sale de la consola al releerla, y con ella la columna.
    expect(component.desk()!.students.map((s) => s.name)).toEqual(['Beto Salas']);
    expect(component.consoleColumns()).toBe(component.studentColumns);
  });

  it('una devolución que falla lo dice y la fila se queda (T036)', async () => {
    const consola = consolaConDevolvible({ devolverFalla: true });
    await montar(consola);
    const raiz = await aLosAlumnos();

    botonesDevolver(raiz)[0].click();
    await flushMicrotasks();
    fixture.detectChanges();
    botonesDevolver(raiz)[0].click();
    await flushMicrotasks(20);
    fixture.detectChanges();

    expect(component.avisoDeLaDevolucion()).toBe('No se pudo devolver la matrícula. Intenta de nuevo.');
    expect(component.desk()!.students.map((s) => s.name)).toEqual(['Ana Rincón', 'Beto Salas']);
  });

  it('«mi aprendizaje» lee las devueltas por curso y descarta lo que no se puede leer (T035)', async () => {
    const cuerpo = { enrollments: [], paths: [], devueltas: [{ courseId: 'c1', veces: 2 }, { courseId: '', veces: 1 }, { courseId: 'c2', veces: 0 }] };
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } }))));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), AcademyApiClient] });

    const aprendizaje = await TestBed.inject(AcademyApiClient).learning('/api/academy', 'COP');

    expect(aprendizaje).toEqual({ status: 'ok', enrollments: [], paths: [], devueltas: { c1: 2 } });
  });

  it('sin filas devolvibles (un instructor, o la ruta directa) no hay columna ni botón', async () => {
    await montar(puertaDeLaMatricula());
    const raiz = await aLosAlumnos();

    expect(component.consoleColumns()).toBe(component.studentColumns);
    expect(botonesDevolver(raiz)).toHaveLength(0);
  });
});

describe('mensajeDeLaMatricula y el camino (010-educacion-matricula)', () => {
  it.each([
    ['puerta.sesion_requerida', 'Inicia sesión para matricularte.'],
    ['pricing.price_not_found', 'Este curso no admite matrícula en línea ahora.'],
    ['pricing.price_not_in_effect', 'Este curso no admite matrícula en línea ahora.'],
    ['puerta.flujo_no_disponible', 'Este curso no admite matrícula en línea ahora.'],
    ['educacion.entrada_invalida', 'No pudimos leer el curso o el plan. Vuelve a elegirlo.'],
    ['educacion.saga_not_found', 'No encontramos esa matrícula.'],
    ['payments.payment_declined', 'El pago no se pudo completar. Intenta de nuevo o usa otro medio de pago.'],
    ['payments.cualquier_otro', 'El pago no se pudo completar. Intenta de nuevo o usa otro medio de pago.'],
    [RAZON_ACTIVANDO, 'Tu pago quedó registrado. Estamos abriendo tu aula…'],
    ['pricing.unavailable', 'No pudimos completar la matrícula ahora. Intenta en unos minutos.'],
    ['payments.provider_unavailable', 'No pudimos completar la matrícula ahora. Intenta en unos minutos.'],
  ])('«%s» → %s', (code, texto) => {
    expect(mensajeDeLaMatricula(code)).toBe(texto);
  });

  it('un código desconocido dice el genérico, nunca el mensaje del servidor', () => {
    expect(mensajeDeLaMatricula('algo.que_nadie_conoce')).toBe('Algo salió mal con tu matrícula. Intenta de nuevo.');
  });

  it('el camino del CMS viaja saneado, y sin él la academia sigue por la directa', () => {
    expect(sanitizeAcademyConfig({ enrollmentPath: '  puerta ' })).toEqual({ enrollmentPath: 'puerta' });
    expect(sanitizeAcademyConfig({})).toEqual({});
  });
});

describe('El transporte de la matrícula (010-educacion-matricula, T017)', () => {
  it('el curso viaja con la clase que declara el flujo, y el plan por su código (sin plan, null)', () => {
    expect(entradaDeLaMatricula('gestion-agil', ' premium ')).toEqual({
      curso: { kind: 'educacion.curso', id: 'gestion-agil' },
      plan: 'premium',
    });
    expect(entradaDeLaMatricula('gestion-agil', '  ')).toEqual({ curso: { kind: 'educacion.curso', id: 'gestion-agil' }, plan: null });
  });

  it('la llave es la del curso: la misma en dos pestañas o tras una recarga', () => {
    expect(llaveDeLaMatricula('gestion-agil')).toBe('matricula-gestion-agil');
  });

  it('tras n devoluciones del curso la llave se numera, porque la devuelta sigue completada (010-P2 B)', () => {
    expect(llaveDeLaMatricula('gestion-agil', 0)).toBe('matricula-gestion-agil');
    expect(llaveDeLaMatricula('gestion-agil', 1)).toBe('matricula-gestion-agil-1');
    expect(llaveDeLaMatricula('gestion-agil', 2)).toBe('matricula-gestion-agil-2');
  });

  it('lee lo que contestó el servidor sin inventar: sin total, null; con compensaciones pendientes, deshaciendo', () => {
    const leida = leerMatricula({
      id: 'mat-1',
      flujo: 'educacion.matricula',
      numero: 'EDU-0001',
      estado: 'Running',
      datos: { curso: { kind: 'educacion.curso', id: 'gestion-agil' }, plan: null, total: null },
      compensacionesPendientes: 1,
      error: null,
      deshaciendo: false,
    } as never);
    expect(leida).toEqual({
      id: 'mat-1',
      numero: 'EDU-0001',
      estado: 'Running',
      cursoId: 'gestion-agil',
      plan: null,
      total: null,
      deshaciendo: true,
    });
  });
});