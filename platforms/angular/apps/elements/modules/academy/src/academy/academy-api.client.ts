import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type AcademyCourse,
  type AcademyInstructor,
  type AcademyLesson,
  type AcademyPlan,
  type AcademySection,
  type AcademyStudent,
  type CatalogCriteria,
  type CatalogResult,
  type Certificate,
  type CourseDetail,
  type CourseLevel,
  type CourseProgress,
  type EnrollConfirmation,
  type EnrollResult,
  type LessonResource,
  type ProgressUpdate,
} from './academy.model';

/**
 * Thin HTTP client over the Educación / LMS backend contract (provided by the
 * backend agent in parallel). Programs against:
 *
 *  - `GET  /api/academy/courses?q=&category=&level=`        → `{ courses }`
 *  - `GET  /api/academy/course/{id}`                        → `{ course, modules:[{lessons}], instructor }`
 *  - `POST /api/academy/enroll`  `{ courseId, student }`    → `{ orderRef, paymentSessionId, amount, currency }` | `{ enrolled:true }`
 *  - `POST /api/academy/confirm` `{ orderRef }`             → `{ status, enrollmentId }`
 *  - `GET  /api/academy/progress?courseId=&student=`        → `{ completedLessonIds, percent }`
 *  - `POST /api/academy/progress` `{ courseId, lessonId, student }` → `{ percent }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. Every mock path flips the
 * `degraded` flag so the shell can surface a "datos de ejemplo" notice.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class AcademyApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Catalogue search ────────────────────────────────────────────────────────

  async courses(
    apiBase: string,
    criteria: CatalogCriteria,
    currency: string,
  ): Promise<CatalogResult> {
    const query = this.toCatalogQuery(criteria);
    const url = `${apiBase}/courses${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeCatalog(data, currency);
      if (result && (result.courses.length > 0 || isRecord(data))) {
        return result;
      }
      throw new Error('courses-shape');
    } catch (error) {
      this.markDegraded('GET /api/academy/courses', error);
      return mockCatalog(criteria, currency);
    }
  }

  // ─── Course detail ───────────────────────────────────────────────────────────

  async course(apiBase: string, id: string, currency: string): Promise<CourseDetail> {
    const url = `${apiBase}/course/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(data, currency);
      if (detail) {
        return detail;
      }
      throw new Error('course-shape');
    } catch (error) {
      this.markDegraded('GET /api/academy/course/{id}', error);
      return mockDetail(id, currency);
    }
  }

  // ─── Enroll (open a single PSP session, or free enrol directly) ──────────────

  async enroll(
    apiBase: string,
    courseId: string,
    planId: string,
    student: AcademyStudent,
    fallbackAmount: number,
    currency: string,
  ): Promise<EnrollResult> {
    const url = `${apiBase}/enroll`;
    try {
      const data = await this.postJson(url, { courseId, planId, student });
      const result = normalizeEnroll(data, currency);
      if (result) {
        return result;
      }
      throw new Error('enroll-shape');
    } catch (error) {
      this.markDegraded('POST /api/academy/enroll', error);
      if (fallbackAmount <= 0) {
        return {
          orderRef: `FREE-${Date.now().toString(36).toUpperCase()}`,
          paymentSessionId: '',
          amount: 0,
          currency,
          free: true,
          enrollmentId: `ENR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        };
      }
      return {
        orderRef: `MOCK-${Date.now().toString(36).toUpperCase()}`,
        paymentSessionId: `psp_mock_${Math.random().toString(36).slice(2, 10)}`,
        amount: fallbackAmount,
        currency,
        free: false,
      };
    }
  }

  // ─── Confirm (activate the matrícula) ────────────────────────────────────────

  async confirm(apiBase: string, orderRef: string): Promise<EnrollConfirmation> {
    const url = `${apiBase}/confirm`;
    try {
      const data = await this.postJson(url, { orderRef });
      const confirmation = normalizeConfirmation(data);
      if (confirmation) {
        return confirmation;
      }
      throw new Error('confirm-shape');
    } catch (error) {
      this.markDegraded('POST /api/academy/confirm', error);
      return {
        status: 'active',
        enrollmentId: `ENR-${orderRef}`,
      };
    }
  }

  // ─── Progress (read) ─────────────────────────────────────────────────────────

  async progress(
    apiBase: string,
    courseId: string,
    student: string,
  ): Promise<CourseProgress> {
    const params = new URLSearchParams();
    if (courseId) {
      params.set('courseId', courseId);
    }
    if (student) {
      params.set('student', student);
    }
    const query = params.toString();
    const url = `${apiBase}/progress${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const progress = normalizeProgress(data);
      if (progress) {
        return progress;
      }
      throw new Error('progress-shape');
    } catch (error) {
      this.markDegraded('GET /api/academy/progress', error);
      // Fresh enrolment starts at zero — a legitimate empty state, not a failure UI.
      return { completedLessonIds: [], percent: 0 };
    }
  }

  // ─── Progress (mark a lesson complete) ───────────────────────────────────────

  async markComplete(
    apiBase: string,
    courseId: string,
    lessonId: string,
    student: string,
    fallbackPercent: number,
  ): Promise<ProgressUpdate> {
    const url = `${apiBase}/progress`;
    try {
      const data = await this.postJson(url, { courseId, lessonId, student });
      const update = normalizeProgressUpdate(data);
      if (update) {
        return update;
      }
      throw new Error('progress-update-shape');
    } catch (error) {
      this.markDegraded('POST /api/academy/progress', error);
      return { percent: fallbackPercent };
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(url: string): Promise<unknown> {
    return this.request(url, { method: 'GET' });
  }

  private postJson(url: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request(url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  private toCatalogQuery(criteria: CatalogCriteria): string {
    const params = new URLSearchParams();
    if (criteria.q) {
      params.set('q', criteria.q);
    }
    if (criteria.category) {
      params.set('category', criteria.category);
    }
    if (criteria.level) {
      params.set('level', criteria.level);
    }
    if (criteria.sort && criteria.sort !== 'relevance') {
      params.set('sort', criteria.sort);
    }
    return params.toString();
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Educación API responds.
    this.#logger.warn(`Academy API "${endpoint}" unavailable — using mock data.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

function readLevel(value: unknown): CourseLevel {
  const raw = readString(value).toLowerCase();
  return raw === 'intermediate' || raw === 'advanced' ? raw : 'beginner';
}

function normalizeCourse(value: unknown, fallbackCurrency: string): AcademyCourse | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim() || readString(value['code']).trim();
  const title = readString(value['title']).trim() || readString(value['name']).trim();
  if (!id || !title) {
    return null;
  }
  const amount = readNumber(value['amount'] ?? value['price']);
  const listAmount = readNumber(value['listAmount'] ?? value['listPrice']);
  return {
    id,
    title,
    subtitle: readString(value['subtitle']).trim() || readString(value['description']).trim(),
    amount,
    listAmount: listAmount > amount ? listAmount : undefined,
    currency: readString(value['currency']).trim() || fallbackCurrency,
    category: readString(value['category']).trim(),
    level: readLevel(value['level']),
    durationMinutes: Math.trunc(readNumber(value['durationMinutes'] ?? value['duration'])),
    lessonCount: Math.trunc(readNumber(value['lessonCount'])),
    rating: readNumber(value['rating']),
    studentCount: Math.trunc(readNumber(value['studentCount'])),
    instructorName: readString(value['instructorName']).trim(),
    cover: readString(value['cover']).trim() || readString(value['image']).trim(),
    badges: readStringArray(value['badges']),
  };
}

function normalizeCatalog(value: unknown, fallbackCurrency: string): CatalogResult | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['courses'])
      ? value['courses']
      : isRecord(value) && Array.isArray(value['items'])
        ? value['items']
        : null;
  if (!list) {
    return null;
  }
  return {
    courses: list
      .map((entry) => normalizeCourse(entry, fallbackCurrency))
      .filter((course): course is AcademyCourse => course !== null),
  };
}

function normalizeResource(value: unknown): LessonResource | null {
  if (!isRecord(value)) {
    return null;
  }
  const url = readString(value['url']).trim();
  const title = readString(value['title']).trim() || readString(value['name']).trim();
  if (!url && !title) {
    return null;
  }
  return {
    id: readString(value['id']).trim() || `res-${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Recurso',
    url,
    fileType: readString(value['fileType']).trim().toUpperCase() || 'PDF',
    size: readString(value['size']).trim(),
  };
}

function normalizeLesson(value: unknown): AcademyLesson | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim();
  if (!id || !title) {
    return null;
  }
  const kindRaw = readString(value['kind']).toLowerCase();
  const kind = (['video', 'reading', 'quiz', 'assignment'] as const).includes(kindRaw as never)
    ? (kindRaw as AcademyLesson['kind'])
    : 'video';
  const rawResources = Array.isArray(value['resources']) ? value['resources'] : [];
  return {
    id,
    title,
    kind,
    durationMinutes: Math.trunc(readNumber(value['durationMinutes'] ?? value['duration'])),
    videoRef: readString(value['videoRef']).trim() || readString(value['video']).trim(),
    body: readString(value['body']).trim() || readString(value['transcript']).trim(),
    preview: readBoolean(value['preview']),
    resources: rawResources
      .map((entry) => normalizeResource(entry))
      .filter((entry): entry is LessonResource => entry !== null),
    allowAssignment: readBoolean(value['allowAssignment']),
  };
}

function normalizeSection(value: unknown): AcademySection | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim();
  if (!id && !title) {
    return null;
  }
  const rawLessons = Array.isArray(value['lessons']) ? value['lessons'] : [];
  return {
    id: id || `sec-${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Módulo',
    lessons: rawLessons
      .map((entry) => normalizeLesson(entry))
      .filter((entry): entry is AcademyLesson => entry !== null),
  };
}

function normalizePlan(value: unknown, fallbackAmount: number): AcademyPlan | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const label = readString(value['label']).trim() || readString(value['name']).trim();
  if (!id && !label) {
    return null;
  }
  return {
    id: id || `plan-${Math.random().toString(36).slice(2, 8)}`,
    label: label || 'Plan',
    description: readString(value['description']).trim(),
    amount: readNumber(value['amount'] ?? value['price']) || fallbackAmount,
    installments: readString(value['installments']).trim() || undefined,
    perks: readStringArray(value['perks']),
    featured: readBoolean(value['featured']),
  };
}

function normalizeInstructor(value: unknown): AcademyInstructor {
  const record = isRecord(value) ? value : {};
  return {
    name: readString(record['name']).trim() || 'Instructor',
    headline: readString(record['headline']).trim(),
    bio: readString(record['bio']).trim(),
    avatar: readString(record['avatar']).trim(),
    courseCount: Math.trunc(readNumber(record['courseCount'])),
    studentCount: Math.trunc(readNumber(record['studentCount'])),
    rating: readNumber(record['rating']),
  };
}

function normalizeDetail(value: unknown, fallbackCurrency: string): CourseDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const course = normalizeCourse(value['course'] ?? value, fallbackCurrency);
  if (!course) {
    return null;
  }
  // Contract calls them `modules`; we model them as `sections` — accept both.
  const rawSections = Array.isArray(value['sections'])
    ? value['sections']
    : Array.isArray(value['modules'])
      ? value['modules']
      : [];
  const rawPlans = Array.isArray(value['plans']) ? value['plans'] : [];
  return {
    course,
    description: readString(value['description']).trim() || course.subtitle,
    outcomes: readStringArray(value['outcomes']),
    sections: rawSections
      .map((entry) => normalizeSection(entry))
      .filter((entry): entry is AcademySection => entry !== null),
    plans: rawPlans
      .map((entry) => normalizePlan(entry, course.amount))
      .filter((entry): entry is AcademyPlan => entry !== null),
    instructor: normalizeInstructor(value['instructor']),
  };
}

function normalizeEnroll(value: unknown, fallbackCurrency: string): EnrollResult | null {
  if (!isRecord(value)) {
    return null;
  }
  // Free path: `{ enrolled: true }` (optionally with an id).
  if (readBoolean(value['enrolled']) || readBoolean(value['free'])) {
    return {
      orderRef: readString(value['orderRef']).trim() || `FREE-${Date.now().toString(36).toUpperCase()}`,
      paymentSessionId: '',
      amount: 0,
      currency: readString(value['currency']).trim() || fallbackCurrency,
      free: true,
      enrollmentId:
        readString(value['enrollmentId']).trim() ||
        `ENR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    };
  }
  const orderRef = readString(value['orderRef']).trim() || readString(value['id']).trim();
  const paymentSessionId =
    readString(value['paymentSessionId']).trim() || readString(value['sessionId']).trim();
  if (!orderRef || !paymentSessionId) {
    return null;
  }
  return {
    orderRef,
    paymentSessionId,
    amount: readNumber(value['amount']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
    free: false,
  };
}

function normalizeConfirmation(value: unknown): EnrollConfirmation | null {
  if (!isRecord(value)) {
    return null;
  }
  const enrollmentId =
    readString(value['enrollmentId']).trim() || readString(value['id']).trim();
  if (!enrollmentId) {
    return null;
  }
  return {
    status: readString(value['status']).trim() || 'active',
    enrollmentId,
  };
}

function normalizeProgress(value: unknown): CourseProgress | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!Array.isArray(value['completedLessonIds']) && value['percent'] === undefined) {
    return null;
  }
  return {
    completedLessonIds: readStringArray(value['completedLessonIds']),
    percent: clampPercent(readNumber(value['percent'])),
  };
}

function normalizeProgressUpdate(value: unknown): ProgressUpdate | null {
  if (!isRecord(value) || value['percent'] === undefined) {
    return null;
  }
  return { percent: clampPercent(readNumber(value['percent'])) };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// ─── Mock data (visible degradation when the backend is not yet wired) ─────────

const MOCK_CATEGORIES = ['Desarrollo', 'Diseño', 'Negocios', 'Datos', 'Marketing'];

function mockCatalog(criteria: CatalogCriteria, currency: string): CatalogResult {
  const all = mockCourses(currency);
  const term = criteria.q.trim().toLowerCase();
  let courses = term
    ? all.filter(
        (course) =>
          course.title.toLowerCase().includes(term) ||
          course.instructorName.toLowerCase().includes(term) ||
          course.category.toLowerCase().includes(term),
      )
    : all;
  if (criteria.category) {
    courses = courses.filter((course) => course.category === criteria.category);
  }
  if (criteria.level) {
    courses = courses.filter((course) => course.level === criteria.level);
  }
  return { courses: sortMock(courses, criteria.sort) };
}

function sortMock(
  courses: readonly AcademyCourse[],
  sort: CatalogCriteria['sort'],
): AcademyCourse[] {
  const copy = [...courses];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'price-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'rating':
      return copy.sort((a, b) => b.rating - a.rating);
    case 'newest':
      return copy.reverse();
    default:
      return copy.sort((a, b) => b.studentCount - a.studentCount);
  }
}

export const ACADEMY_MOCK_CATEGORIES = MOCK_CATEGORIES;

function mockCourses(currency: string): readonly AcademyCourse[] {
  const base: ReadonlyArray<Omit<AcademyCourse, 'currency'>> = [
    {
      id: 'CMOCK-1',
      title: 'Angular moderno: signals, zoneless y Web Components',
      subtitle: 'Construye apps reactivas sin Zone.js, de cero a producción',
      amount: 480_000,
      listAmount: 720_000,
      category: 'Desarrollo',
      level: 'intermediate',
      durationMinutes: 1_140,
      lessonCount: 42,
      rating: 4.8,
      studentCount: 3_240,
      instructorName: 'Camila Restrepo',
      cover: '',
      badges: ['Certificado', 'Acceso de por vida', '12 cuotas'],
    },
    {
      id: 'CMOCK-2',
      title: 'Diseño de producto con Atomic Design',
      subtitle: 'Design systems escalables, tokens y componentes premium',
      amount: 390_000,
      category: 'Diseño',
      level: 'beginner',
      durationMinutes: 720,
      lessonCount: 28,
      rating: 4.7,
      studentCount: 2_110,
      instructorName: 'Andrés Gómez',
      cover: '',
      badges: ['Certificado', 'Proyecto final'],
    },
    {
      id: 'CMOCK-3',
      title: 'Fundamentos de Ciencia de Datos con Python',
      subtitle: 'Pandas, visualización y modelos predictivos paso a paso',
      amount: 560_000,
      listAmount: 890_000,
      category: 'Datos',
      level: 'beginner',
      durationMinutes: 1_560,
      lessonCount: 55,
      rating: 4.9,
      studentCount: 5_870,
      instructorName: 'Laura Méndez',
      cover: '',
      badges: ['Certificado', 'Más vendido', 'Datasets incluidos'],
    },
    {
      id: 'CMOCK-4',
      title: 'Introducción gratuita a la programación',
      subtitle: 'Tu primer curso: lógica, variables y tu primer programa',
      amount: 0,
      category: 'Desarrollo',
      level: 'beginner',
      durationMinutes: 240,
      lessonCount: 12,
      rating: 4.6,
      studentCount: 12_400,
      instructorName: 'Camila Restrepo',
      cover: '',
      badges: ['Gratis', 'Certificado'],
    },
    {
      id: 'CMOCK-5',
      title: 'Estrategia de Marketing Digital de alto impacto',
      subtitle: 'Embudos, contenido y analítica para crecer de verdad',
      amount: 420_000,
      category: 'Marketing',
      level: 'intermediate',
      durationMinutes: 840,
      lessonCount: 33,
      rating: 4.5,
      studentCount: 1_980,
      instructorName: 'Diana Torres',
      cover: '',
      badges: ['Certificado', 'Plantillas'],
    },
    {
      id: 'CMOCK-6',
      title: 'Arquitectura de software: Clean & SOLID en práctica',
      subtitle: 'Diseña sistemas mantenibles con patrones probados',
      amount: 650_000,
      listAmount: 980_000,
      category: 'Desarrollo',
      level: 'advanced',
      durationMinutes: 1_320,
      lessonCount: 48,
      rating: 4.9,
      studentCount: 2_640,
      instructorName: 'Andrés Gómez',
      cover: '',
      badges: ['Certificado', 'Mentoría', 'Avanzado'],
    },
  ];
  return base.map((course) => ({ ...course, currency }));
}

function mockDetail(id: string, currency: string): CourseDetail {
  const course = mockCourses(currency).find((entry) => entry.id === id) ?? mockCourses(currency)[0];
  const isFree = course.amount === 0;
  return {
    course,
    description:
      'Curso de demostración. La descripción real, el temario completo y la galería ' +
      'se cargan desde el catálogo del CMS cuando el motor de la academia responde. ' +
      'Aprenderás con proyectos prácticos, recursos descargables y acompañamiento.',
    outcomes: [
      'Dominar los conceptos clave desde la base',
      'Construir un proyecto real de principio a fin',
      'Aplicar buenas prácticas de la industria',
      'Obtener un certificado verificable al completar',
    ],
    sections: [
      {
        id: `${course.id}-s1`,
        title: 'Módulo 1 · Fundamentos',
        lessons: [
          {
            id: `${course.id}-l1`,
            title: 'Bienvenida y cómo aprovechar el curso',
            kind: 'video',
            durationMinutes: 6,
            videoRef: '',
            body: 'En esta lección damos la bienvenida y explicamos la ruta de aprendizaje.',
            preview: true,
            resources: [
              { id: 'r1', title: 'Guía de inicio (PDF)', url: '#', fileType: 'PDF', size: '1.2 MB' },
            ],
            allowAssignment: false,
          },
          {
            id: `${course.id}-l2`,
            title: 'Conceptos esenciales',
            kind: 'video',
            durationMinutes: 14,
            videoRef: '',
            body: 'Repasamos los conceptos esenciales con ejemplos.',
            preview: false,
            resources: [],
            allowAssignment: false,
          },
          {
            id: `${course.id}-l3`,
            title: 'Lectura: glosario y referencias',
            kind: 'reading',
            durationMinutes: 10,
            videoRef: '',
            body: 'Material de lectura complementario con el glosario del curso.',
            preview: false,
            resources: [
              { id: 'r2', title: 'Glosario completo', url: '#', fileType: 'PDF', size: '640 KB' },
            ],
            allowAssignment: false,
          },
        ],
      },
      {
        id: `${course.id}-s2`,
        title: 'Módulo 2 · Práctica guiada',
        lessons: [
          {
            id: `${course.id}-l4`,
            title: 'Tu primer ejercicio práctico',
            kind: 'video',
            durationMinutes: 22,
            videoRef: '',
            body: 'Construimos paso a paso el primer ejercicio práctico.',
            preview: false,
            resources: [
              { id: 'r3', title: 'Código base', url: '#', fileType: 'ZIP', size: '3.1 MB' },
            ],
            allowAssignment: false,
          },
          {
            id: `${course.id}-l5`,
            title: 'Quiz de comprobación',
            kind: 'quiz',
            durationMinutes: 8,
            videoRef: '',
            body: 'Pon a prueba lo aprendido con este quiz rápido.',
            preview: false,
            resources: [],
            allowAssignment: false,
          },
          {
            id: `${course.id}-l6`,
            title: 'Tarea: entrega tu proyecto',
            kind: 'assignment',
            durationMinutes: 30,
            videoRef: '',
            body: 'Sube tu proyecto para recibir retroalimentación del instructor.',
            preview: false,
            resources: [
              { id: 'r4', title: 'Rúbrica de evaluación', url: '#', fileType: 'PDF', size: '420 KB' },
            ],
            allowAssignment: true,
          },
        ],
      },
      {
        id: `${course.id}-s3`,
        title: 'Módulo 3 · Cierre y certificación',
        lessons: [
          {
            id: `${course.id}-l7`,
            title: 'Recapitulación y próximos pasos',
            kind: 'video',
            durationMinutes: 12,
            videoRef: '',
            body: 'Cerramos el curso y trazamos los próximos pasos.',
            preview: false,
            resources: [],
            allowAssignment: false,
          },
        ],
      },
    ],
    plans: isFree
      ? [
          {
            id: `${course.id}-free`,
            label: 'Acceso gratuito',
            description: 'Inscríbete sin costo y empieza ya',
            amount: 0,
            perks: ['Acceso completo al curso', 'Certificado al completar'],
            featured: true,
          },
        ]
      : [
          {
            id: `${course.id}-basic`,
            label: 'Plan completo',
            description: 'Todo lo que necesitas para dominar el curso',
            amount: course.amount,
            installments: `4 x ${Math.round(course.amount / 4).toLocaleString('es-CO')}`,
            perks: [
              'Acceso de por vida',
              'Recursos descargables',
              'Certificado verificable',
              'Soporte en Q&A',
            ],
            featured: false,
          },
          {
            id: `${course.id}-premium`,
            label: 'Plan con mentoría',
            description: 'Acompañamiento personalizado del instructor',
            amount: Math.round(course.amount * 1.6),
            installments: `6 x ${Math.round((course.amount * 1.6) / 6).toLocaleString('es-CO')}`,
            perks: [
              'Todo lo del plan completo',
              '3 sesiones 1:1 con el instructor',
              'Revisión de tu proyecto final',
              'Comunidad privada',
            ],
            featured: true,
          },
        ],
    instructor: {
      name: course.instructorName,
      headline: 'Instructor experto · Synergos Academy',
      bio:
        'Profesional con amplia experiencia en la industria y miles de estudiantes ' +
        'formados. Enseña con un enfoque práctico, directo y orientado a resultados.',
      avatar: '',
      courseCount: 8,
      studentCount: 18_400,
      rating: 4.8,
    },
  };
}

export const ACADEMY_MOCK_CERTIFICATE_BASE = 'https://verify.synergos.academy/c';

export function buildMockCertificate(
  studentName: string,
  courseTitle: string,
): Certificate {
  const id = `CERT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  return {
    id,
    studentName,
    courseTitle,
    issuedAt: new Date().toISOString(),
    verifyUrl: `${ACADEMY_MOCK_CERTIFICATE_BASE}/${id}`,
  };
}
