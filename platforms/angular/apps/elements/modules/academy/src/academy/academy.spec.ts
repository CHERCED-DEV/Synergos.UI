import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { AcademyApiClient } from './academy-api.client';
import { AcademyFulfillmentStrategy } from './academy-fulfillment.strategy';
import { AcademyElementComponent } from './academy';

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
function bordeDeAula(opciones: {
  readonly percentPorMarca: readonly number[];
  readonly caidos?: readonly string[];
  readonly certificado?: Record<string, unknown>;
}): { fetch: (url: string, init?: RequestInit) => Promise<Response>; marcadas: string[] } {
  const marcadas: string[] = [];
  const caido = (metodo: string, url: string): boolean =>
    (opciones.caidos ?? []).some((entrada) => {
      const [cabeza, cola] = entrada.split(' ');
      return cola === undefined
        ? url.includes(cabeza)
        : cabeza === metodo && url.includes(cola);
    });
  const responde = (body: unknown): Response =>
    ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

  return {
    marcadas,
    fetch: (url: string, init?: RequestInit) => {
      const metodo = (init?.method ?? 'GET').toUpperCase();
      const ruta = String(url);
      if (caido(metodo, ruta)) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
        } as Response);
      }
      if (metodo === 'POST' && ruta.includes('/progress')) {
        const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { lessonId?: string };
        marcadas.push(String(cuerpo.lessonId ?? ''));
        const indice = Math.min(marcadas.length - 1, opciones.percentPorMarca.length - 1);
        return Promise.resolve(responde({ percent: opciones.percentPorMarca[indice] }));
      }
      if (metodo === 'GET' && ruta.includes('/certificate') && opciones.certificado) {
        return Promise.resolve(responde({ certificate: opciones.certificado }));
      }
      return Promise.reject(new Error('offline'));
    },
  };
}

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
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('AcademyElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<AcademyElementComponent>;
  let component: AcademyElementComponent;

  async function createComponent(): Promise<void> {
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
    fixture.detectChanges();
    // Initial catalogue search runs in the constructor; let it settle.
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
    expect(component.enrollmentId().length).toBeGreaterThan(0);

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
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openCourse(component.courses().find((c) => c.amount <= 0)!);
    await flushMicrotasks();
    expect(component.isFreeCourse()).toBe(true);

    component.startEnrollment();
    await flushMicrotasks(30);
    expect(component.view()).toBe('enrolled');
    expect(component.enrollmentId().length).toBeGreaterThan(0);
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
