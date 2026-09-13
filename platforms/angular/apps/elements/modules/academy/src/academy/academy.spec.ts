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
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
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
    for (const lesson of component.orderedLessons()) {
      component.selectLesson(lesson);
      component.markLessonComplete();
      await flushMicrotasks();
    }
    expect(component.isCourseComplete()).toBe(true);

    component.viewCertificate();
    await flushMicrotasks();
    expect(component.view()).toBe('certificate');
    expect(component.walletCredentials().length).toBe(1);
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

  // ── mi aprendizaje (SH-4): the account shell lists enrolments + paths ─────────
  it('loads "mi aprendizaje" (SH-4) with enrolments and learning paths', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToLearning();
    await flushMicrotasks();
    expect(component.view()).toBe('learning');
    expect(component.enrollments().length).toBeGreaterThan(0);
    expect(component.paths().length).toBeGreaterThan(0);
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
  it('creates a course through the SH-6 authoring wizard', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('instructor');
    await flushMicrotasks();
    component.openCreate();
    expect(component.instructorView()).toBe('create');

    component.onCreateDraftChange({
      title: 'Curso de prueba',
      subtitle: 'Un subtítulo',
      category: 'Desarrollo',
      level: 'beginner',
      price: '350000',
      modules: 'Módulo 1\nMódulo 2',
    });
    expect(component.createValidity()['publicar']).toBe(true);

    component.onCreatePublished(component.createDraft());
    await flushMicrotasks();
    expect(component.createResultId().length).toBeGreaterThan(0);
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

  it('degrades the certificate endpoint to a verifiable mock', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const cert = await client.certificate('/api/academy', 'CMOCK-1', 'ada@b.co', 'Ada', 'Angular');
    expect(client.degraded).toBe(true);
    expect(cert.id.length).toBeGreaterThan(0);
    expect(cert.verifyUrl).toContain(cert.id);
  });

  it('degrades "mi aprendizaje" and folds an in-session enrolment', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
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

    const learning = await client.learning('/api/academy', 'ada@b.co', 'COP');
    expect(client.degraded).toBe(true);
    expect(learning.enrollments.some((entry) => entry.course.id === 'CNEW')).toBe(true);
    expect(learning.paths.length).toBeGreaterThan(0);
  });

  it('degrades the instructor desk + creates a course that surfaces in it (mock)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.createCourse(
      '/api/academy',
      { title: 'Nuevo', subtitle: '', category: 'Datos', level: 'beginner', price: 200_000, modules: ['M1'] },
      'COP',
    );
    expect(result.id.length).toBeGreaterThan(0);

    const desk = await client.instructorDesk('/api/academy', 'instructor');
    expect(client.degraded).toBe(true);
    expect(desk.courses.some((course) => course.id === result.id)).toBe(true);
    expect(desk.questions.length).toBeGreaterThan(0);
  });
});
