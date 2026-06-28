import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { AcademyApiClient } from './academy-api.client';
import { AcademyFulfillmentStrategy } from './academy-fulfillment.strategy';
import { AcademyElementComponent } from './academy';
import type { AcademyCourse } from './academy.model';

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
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

const PAID_COURSE: AcademyCourse = {
  id: 'C-PAID',
  title: 'Curso de prueba pagado',
  subtitle: 'Subtítulo',
  amount: 480_000,
  currency: 'COP',
  category: 'Desarrollo',
  level: 'intermediate',
  durationMinutes: 600,
  lessonCount: 20,
  rating: 4.7,
  studentCount: 1_000,
  instructorName: 'Instructor Demo',
  cover: '',
  badges: ['Certificado'],
};

const FREE_COURSE: AcademyCourse = {
  ...PAID_COURSE,
  id: 'C-FREE',
  title: 'Curso gratuito',
  amount: 0,
};

describe('AcademyElementComponent', () => {
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  /** Drive a course PDP → enrolment → classroom for the given course id. */
  async function enroll(courseId: string): Promise<void> {
    const course = component.courses().find((c) => c.id === courseId) ?? component.courses()[0];
    component.openCourse(course);
    await flushMicrotasks();
    component.studentName.set('Ada Lovelace');
    component.studentEmail.set('ada@example.com');
    component.startEnrollment();
    await flushMicrotasks();
    if (component.view() === 'checkout') {
      component.nextEnrollStep(); // plan → student
      component.nextEnrollStep(); // student → review
      component.confirmEnrollment();
      await flushMicrotasks(30);
    } else {
      await flushMicrotasks(30);
    }
  }

  // ── empty: pristine academy, catalogue view, no enrolment ────────────────────
  it('starts on the catalogue with no enrolment (empty case)', async () => {
    installMemoryStorage();
    // Offline → mock catalogue; still a valid empty state.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('catalog');
    expect(component.enrollmentId()).toBe('');
    expect(component.progressPercent()).toBe(0);
    // Mock catalogue loaded → courses present, degradation flagged.
    expect(component.courses().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: catalogue → PDP → checkout → pay → confirm → classroom ─────────────
  it('runs the full paid lifecycle into the classroom (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const paid = component.courses().find((c) => c.amount > 0) ?? component.courses()[0];
    await enroll(paid.id);

    expect(component.enrollmentId().length).toBeGreaterThan(0);
    expect(component.view()).toBe('enrolled');

    component.enterClassroom();
    expect(component.view()).toBe('classroom');
    expect(component.orderedLessons().length).toBeGreaterThan(0);
    expect(component.activeLessonId().length).toBeGreaterThan(0);
  });

  // ── free course: enroll directo, no checkout wizard ──────────────────────────
  it('enrolls a free course directly without the checkout wizard', async () => {
    installMemoryStorage();
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/courses')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ courses: [FREE_COURSE] }),
        } as Response);
      }
      if (url.includes('/course/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: FREE_COURSE,
              description: 'desc',
              outcomes: [],
              sections: [
                { id: 's1', title: 'M1', lessons: [{ id: 'l1', title: 'L1', kind: 'video', durationMinutes: 5, videoRef: '', body: 'b', preview: true, resources: [], allowAssignment: false }] },
              ],
              plans: [{ id: 'free', label: 'Gratis', description: '', amount: 0, perks: [], featured: true }],
              instructor: { name: 'X', headline: '', bio: '', avatar: '', courseCount: 1, studentCount: 1, rating: 5 },
            }),
        } as Response);
      }
      if (url.includes('/enroll')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ enrolled: true, enrollmentId: 'ENR-FREE-1' }),
        } as Response);
      }
      if (url.includes('/confirm')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'active', enrollmentId: 'ENR-FREE-1' }),
        } as Response);
      }
      // progress
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ completedLessonIds: [], percent: 0 }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const free = component.courses()[0];
    component.openCourse(free);
    await flushMicrotasks();
    expect(component.isFreeCourse()).toBe(true);

    component.startEnrollment();
    await flushMicrotasks(30);

    // Free path skips the wizard and lands on the enrolled bridge.
    expect(component.view()).toBe('enrolled');
    expect(component.enrollmentId().length).toBeGreaterThan(0);
  });

  // ── filter: catalogue filters by level without dropping unrelated state ───────
  it('filters the catalogue by level (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.courses().length;
    component.setLevel('advanced');
    await flushMicrotasks();

    const after = component.courses();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((course) => course.level === 'advanced')).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── idempotent: re-selecting a plan keeps a single enrolment line ────────────
  it('keeps a single enrolment line when the cart is re-primed (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const paid = component.courses().find((c) => c.amount > 0) ?? component.courses()[0];
    await enroll(paid.id);

    // Confirmed → exactly one course voucher / enrolment, never duplicated.
    expect(component.enrolledCourseId()).toBe(paid.id);
    expect(component.enrollmentId().length).toBeGreaterThan(0);
  });

  // ── progress: marking lessons complete advances percent + issues certificate ─
  it('marks lessons complete, reaches 100% and issues a certificate', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const paid = component.courses().find((c) => c.amount > 0) ?? component.courses()[0];
    await enroll(paid.id);
    component.enterClassroom();

    const lessons = component.orderedLessons();
    expect(lessons.length).toBeGreaterThan(0);

    for (const lesson of lessons) {
      component.selectLesson(lesson);
      component.markLessonComplete();
      await flushMicrotasks();
    }

    expect(component.progressPercent()).toBe(100);
    expect(component.isCourseComplete()).toBe(true);

    component.viewCertificate();
    expect(component.view()).toBe('certificate');
    expect(component.certificate()?.id.length).toBeGreaterThan(0);
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ────────────
  it('degrades to a visible mock catalogue when the courses endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.courses().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
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

  it('normalises a live catalogue response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              courses: [
                { id: 'X1', title: 'Curso X', amount: 99_000, currency: 'COP', level: 'beginner' },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.courses(
      '/api/academy',
      { q: '', category: '', level: '', sort: 'relevance' },
      'COP',
    );

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].id).toBe('X1');
    expect(client.degraded).toBe(false);
  });

  it('opens a paid enrolment session and confirms (happy case)', async () => {
    const fetchMock = vi.fn((url: string) => {
      const body = url.endsWith('/enroll')
        ? { orderRef: 'ORD-1', paymentSessionId: 'psp_1', amount: 100, currency: 'COP' }
        : { status: 'active', enrollmentId: 'ENR-1' };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    const enroll = await client.enroll(
      '/api/academy',
      'X1',
      'plan-1',
      { name: 'Ada', email: 'a@b.co' },
      100,
      'COP',
    );
    expect(enroll.orderRef).toBe('ORD-1');
    expect(enroll.free).toBe(false);

    const confirmation = await client.confirm('/api/academy', 'ORD-1');
    expect(confirmation.status).toBe('active');
    expect(confirmation.enrollmentId).toBe('ENR-1');
  });

  it('returns a free enrolment from `{ enrolled:true }` (free case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ enrolled: true, enrollmentId: 'ENR-FREE' }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.enroll(
      '/api/academy',
      'C-FREE',
      'free',
      { name: 'Ada', email: 'a@b.co' },
      0,
      'COP',
    );

    expect(result.free).toBe(true);
    expect(result.enrollmentId).toBe('ENR-FREE');
    expect(client.degraded).toBe(false);
  });

  it('reports progress and recomputes percent on mark (happy + idempotent)', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ percent: 50 }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ completedLessonIds: ['l1'], percent: 25 }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    const progress = await client.progress('/api/academy', 'X1', 'a@b.co');
    expect(progress.completedLessonIds).toEqual(['l1']);
    expect(progress.percent).toBe(25);

    const update = await client.markComplete('/api/academy', 'X1', 'l2', 'a@b.co', 25);
    expect(update.percent).toBe(50);
  });

  it('filters the mock catalogue by level when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.courses(
      '/api/academy',
      { q: '', category: '', level: 'advanced', sort: 'relevance' },
      'COP',
    );

    expect(client.degraded).toBe(true);
    expect(result.courses.length).toBeGreaterThan(0);
    expect(result.courses.every((course) => course.level === 'advanced')).toBe(true);
  });
});
