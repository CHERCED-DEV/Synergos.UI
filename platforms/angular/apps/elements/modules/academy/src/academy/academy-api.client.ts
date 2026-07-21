import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type AcademyCourse,
  type AcademyFacet,
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
  type CourseStatus,
  type CreateCourseRequest,
  type CreateCourseResult,
  type EnrollConfirmation,
  type EnrollResult,
  type EnrolledCourse,
  type InstructorCourse,
  type InstructorDeskResult,
  type InstructorQuestion,
  type InstructorStudent,
  type LearningPath,
  type LearningResult,
  type LessonResource,
  type ProgressUpdate,
} from './academy.model';

/**
 * Thin HTTP client over the Educación / LMS backend contract (provided by the
 * backend agent in parallel). Programs against the existing + new contract:
 *
 *  - `GET  /api/academy/courses?q=&category=&level=&price=`  → `{ courses, facets, total }`
 *  - `GET  /api/academy/course/{id}`                        → `{ course, modules:[{lessons}], instructor }`
 *  - `POST /api/academy/enroll`  `{ courseId, student }`    → `{ orderRef, paymentSessionId, amount, currency }` | `{ enrolled:true }`
 *  - `POST /api/academy/confirm` `{ orderRef }`             → `{ status, enrollmentId }`
 *  - `GET  /api/academy/progress?student=&course=`          → `{ completedLessonIds, percent }`
 *  - `POST /api/academy/progress` `{ course, lessonId, student }` → `{ percent }`
 *  - `GET  /api/academy/certificate?student=&course=`       → `{ id, studentName, courseTitle, verifyUrl }`
 *  - `GET  /api/academy/learning?student=`                  → `{ enrollments, paths }`
 *  - `GET  /api/academy/instructor/courses?instructor=`     → `{ courses, students, questions }`
 *  - `POST /api/academy/course`  `{ …create… }`             → `{ id, status }`
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

  /** In-memory learning progress so a mock enrolment surfaces in "mi aprendizaje". */
  #enrollments: readonly EnrolledCourse[] = [];
  /** In-memory freshly-created courses so they show up in the instructor console. */
  #createdCourses: readonly InstructorCourse[] = [];

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Catalogue search (faceted) ───────────────────────────────────────────────

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
    if (student) {
      params.set('student', student);
    }
    if (courseId) {
      params.set('course', courseId);
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
      const data = await this.postJson(url, { course: courseId, lessonId, student });
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

  // ─── Certificate (verifiable credential) ─────────────────────────────────────

  async certificate(
    apiBase: string,
    courseId: string,
    student: string,
    studentName: string,
    courseTitle: string,
  ): Promise<Certificate> {
    const params = new URLSearchParams();
    if (student) {
      params.set('student', student);
    }
    if (courseId) {
      params.set('course', courseId);
    }
    const query = params.toString();
    const url = `${apiBase}/certificate${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const certificate = normalizeCertificate(data);
      if (certificate) {
        return certificate;
      }
      throw new Error('certificate-shape');
    } catch (error) {
      this.markDegraded('GET /api/academy/certificate', error);
      return buildMockCertificate(studentName, courseTitle);
    }
  }

  // ─── Mi aprendizaje (enrolled courses + paths) ───────────────────────────────

  async learning(apiBase: string, student: string, currency: string): Promise<LearningResult> {
    const query = student ? `?student=${encodeURIComponent(student)}` : '';
    const url = `${apiBase}/learning${query}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeLearning(data, currency);
      if (result) {
        return this.mergeLearning(result);
      }
      throw new Error('learning-shape');
    } catch (error) {
      this.markDegraded('GET /api/academy/learning', error);
      return this.mergeLearning(mockLearning(currency));
    }
  }

  /** Reflect an in-session enrolment in "mi aprendizaje". */
  recordEnrollment(enrollment: EnrolledCourse): void {
    this.#enrollments = [
      enrollment,
      ...this.#enrollments.filter((entry) => entry.course.id !== enrollment.course.id),
    ];
  }

  /** Keep the in-session enrolment's live progress in sync with the classroom. */
  updateEnrollmentProgress(courseId: string, percent: number, completedCount: number): void {
    this.#enrollments = this.#enrollments.map((entry) =>
      entry.course.id === courseId
        ? {
            ...entry,
            percent,
            completedCount,
            completed: percent >= 100,
            lastActivityAt: new Date().toISOString().slice(0, 10),
          }
        : entry,
    );
  }

  private mergeLearning(base: LearningResult): LearningResult {
    if (this.#enrollments.length === 0) {
      return base;
    }
    const inSessionIds = new Set(this.#enrollments.map((entry) => entry.course.id));
    const rest = base.enrollments.filter((entry) => !inSessionIds.has(entry.course.id));
    return { ...base, enrollments: [...this.#enrollments, ...rest] };
  }

  // ─── Instructor desk (cursos + alumnos + Q&A) ────────────────────────────────

  async instructorDesk(apiBase: string, instructor: string): Promise<InstructorDeskResult> {
    const query = instructor ? `?instructor=${encodeURIComponent(instructor)}` : '';
    const url = `${apiBase}/instructor/courses${query}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeInstructorDesk(data);
      if (result) {
        return this.mergeInstructorDesk(result);
      }
      throw new Error('instructor-desk-shape');
    } catch (error) {
      this.markDegraded('GET /api/academy/instructor/courses', error);
      return this.mergeInstructorDesk(mockInstructorDesk());
    }
  }

  private mergeInstructorDesk(base: InstructorDeskResult): InstructorDeskResult {
    if (this.#createdCourses.length === 0) {
      return base;
    }
    return { ...base, courses: [...this.#createdCourses, ...base.courses] };
  }

  // ─── Create a course (SH-6 authoring) ─────────────────────────────────────────

  async createCourse(
    apiBase: string,
    body: CreateCourseRequest,
    currency: string,
  ): Promise<CreateCourseResult> {
    const url = `${apiBase}/course`;
    try {
      const data = await this.postJson(url, body);
      const result = normalizeCreate(data);
      if (result) {
        this.seedCreated(result.id, body, currency, result.status);
        return result;
      }
      throw new Error('create-shape');
    } catch (error) {
      this.markDegraded('POST /api/academy/course', error);
      const id = `C-${Date.now().toString(36).toUpperCase()}`;
      this.seedCreated(id, body, currency, 'published');
      return { id, status: 'published' };
    }
  }

  /** Reflect a freshly-created course in the in-memory instructor console. */
  private seedCreated(
    id: string,
    body: CreateCourseRequest,
    currency: string,
    status: CourseStatus,
  ): void {
    const course: InstructorCourse = {
      id,
      title: body.title,
      status,
      price: body.price,
      currency,
      studentCount: 0,
      rating: 0,
      revenue: 0,
      publishedAt: new Date().toISOString().slice(0, 10),
    };
    this.#createdCourses = [course, ...this.#createdCourses];
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
    if (criteria.price) {
      params.set('price', criteria.price);
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

function readCourseStatus(value: unknown): CourseStatus {
  const raw = readString(value).toLowerCase();
  return raw === 'draft' || raw === 'review' ? raw : 'published';
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

function normalizeFacets(value: unknown): readonly AcademyFacet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): AcademyFacet | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const key = readString(entry['key']).trim();
      if (!key) {
        return null;
      }
      const rawValues = Array.isArray(entry['values']) ? entry['values'] : [];
      return {
        key,
        label: readString(entry['label']).trim() || key,
        values: rawValues
          .map((facetValue) => {
            if (!isRecord(facetValue)) {
              return null;
            }
            const facetRaw = readString(facetValue['value']).trim();
            if (!facetRaw) {
              return null;
            }
            return {
              value: facetRaw,
              label: readString(facetValue['label']).trim() || facetRaw,
              count: Math.trunc(readNumber(facetValue['count'])),
            };
          })
          .filter((facetValue): facetValue is AcademyFacet['values'][number] => facetValue !== null),
      };
    })
    .filter((facet): facet is AcademyFacet => facet !== null);
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
  const courses = list
    .map((entry) => normalizeCourse(entry, fallbackCurrency))
    .filter((course): course is AcademyCourse => course !== null);
  const facets = isRecord(value) ? normalizeFacets(value['facets']) : [];
  const total = isRecord(value) ? Math.trunc(readNumber(value['total'])) : 0;
  return {
    courses,
    facets: facets.length > 0 ? facets : deriveFacets(courses),
    total: total || courses.length,
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

function normalizeCertificate(value: unknown): Certificate | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim() || readString(value['certificateId']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    studentName: readString(value['studentName']).trim() || 'Estudiante',
    courseTitle: readString(value['courseTitle']).trim() || 'Curso',
    issuedAt: readString(value['issuedAt']).trim() || new Date().toISOString(),
    verifyUrl:
      readString(value['verifyUrl']).trim() || `${ACADEMY_MOCK_CERTIFICATE_BASE}/${id}`,
    credentialLine: readString(value['credentialLine']).trim() || undefined,
  };
}

function normalizeEnrolledCourse(value: unknown, fallbackCurrency: string): EnrolledCourse | null {
  if (!isRecord(value)) {
    return null;
  }
  const course = normalizeCourse(value['course'] ?? value, fallbackCurrency);
  if (!course) {
    return null;
  }
  const percent = clampPercent(readNumber(value['percent']));
  const lessonCount = Math.max(course.lessonCount, Math.trunc(readNumber(value['lessonCount'])));
  const completedCount = Math.trunc(readNumber(value['completedCount']));
  return {
    enrollmentId: readString(value['enrollmentId']).trim() || `ENR-${course.id}`,
    course,
    percent,
    lessonCount,
    completedCount: completedCount || Math.round((percent / 100) * lessonCount),
    lastActivityAt: readString(value['lastActivityAt']).trim() || new Date().toISOString().slice(0, 10),
    completed: percent >= 100,
  };
}

function normalizePath(value: unknown): LearningPath | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim();
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    description: readString(value['description']).trim(),
    courseIds: readStringArray(value['courseIds']),
    percent: clampPercent(readNumber(value['percent'])),
  };
}

function normalizeLearning(value: unknown, fallbackCurrency: string): LearningResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawEnrollments = Array.isArray(value['enrollments']) ? value['enrollments'] : [];
  const rawPaths = Array.isArray(value['paths']) ? value['paths'] : [];
  if (rawEnrollments.length === 0 && rawPaths.length === 0) {
    return null;
  }
  return {
    enrollments: rawEnrollments
      .map((entry) => normalizeEnrolledCourse(entry, fallbackCurrency))
      .filter((entry): entry is EnrolledCourse => entry !== null),
    paths: rawPaths
      .map((entry) => normalizePath(entry))
      .filter((entry): entry is LearningPath => entry !== null),
  };
}

function normalizeInstructorCourse(value: unknown, fallbackCurrency: string): InstructorCourse | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim();
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    status: readCourseStatus(value['status']),
    price: readNumber(value['price'] ?? value['amount']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
    studentCount: Math.trunc(readNumber(value['studentCount'])),
    rating: readNumber(value['rating']),
    revenue: readNumber(value['revenue']),
    publishedAt: readString(value['publishedAt']).trim(),
  };
}

function normalizeInstructorStudent(value: unknown): InstructorStudent | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    name: readString(value['name']).trim() || 'Estudiante',
    email: readString(value['email']).trim(),
    courseId: readString(value['courseId']).trim(),
    courseTitle: readString(value['courseTitle']).trim() || 'Curso',
    percent: clampPercent(readNumber(value['percent'])),
    enrolledAt: readString(value['enrolledAt']).trim(),
  };
}

function normalizeInstructorQuestion(value: unknown): InstructorQuestion | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    studentName: readString(value['studentName']).trim() || 'Estudiante',
    courseTitle: readString(value['courseTitle']).trim() || 'Curso',
    lessonTitle: readString(value['lessonTitle']).trim(),
    question: readString(value['question']).trim(),
    answered: readBoolean(value['answered']),
    createdAt: readString(value['createdAt']).trim(),
  };
}

function normalizeInstructorDesk(value: unknown): InstructorDeskResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawCourses = Array.isArray(value['courses']) ? value['courses'] : [];
  const rawStudents = Array.isArray(value['students']) ? value['students'] : [];
  const rawQuestions = Array.isArray(value['questions']) ? value['questions'] : [];
  if (rawCourses.length === 0 && rawStudents.length === 0 && rawQuestions.length === 0) {
    return null;
  }
  const courses = rawCourses
    .map((entry) => normalizeInstructorCourse(entry, 'COP'))
    .filter((entry): entry is InstructorCourse => entry !== null);
  const students = rawStudents
    .map((entry) => normalizeInstructorStudent(entry))
    .filter((entry): entry is InstructorStudent => entry !== null);
  const questions = rawQuestions
    .map((entry) => normalizeInstructorQuestion(entry))
    .filter((entry): entry is InstructorQuestion => entry !== null);
  return {
    courses,
    students,
    questions,
    totalStudents:
      Math.trunc(readNumber(value['totalStudents'])) ||
      courses.reduce((sum, course) => sum + course.studentCount, 0),
    totalRevenue:
      readNumber(value['totalRevenue']) || courses.reduce((sum, course) => sum + course.revenue, 0),
    averageRating:
      readNumber(value['averageRating']) ||
      (courses.length > 0
        ? courses.reduce((sum, course) => sum + course.rating, 0) / courses.length
        : 0),
  };
}

function normalizeCreate(value: unknown): CreateCourseResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return { id, status: readCourseStatus(value['status']) };
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
  if (criteria.price) {
    courses = courses.filter((course) => priceBracket(course.amount) === criteria.price);
  }
  const sorted = sortMock(courses, criteria.sort);
  return { courses: sorted, facets: deriveFacets(all), total: sorted.length };
}

/** Coarse price bracket for the precio facet (free / mid / premium). */
function priceBracket(amount: number): string {
  if (amount <= 0) {
    return 'free';
  }
  return amount <= 450_000 ? 'mid' : 'premium';
}

/** Build the SH-1 facets (escuela/categoría · nivel · precio) from a course list. */
function deriveFacets(courses: readonly AcademyCourse[]): readonly AcademyFacet[] {
  const count = (predicate: (course: AcademyCourse) => boolean): number =>
    courses.filter(predicate).length;
  const categories = [...new Set(courses.map((course) => course.category))].filter(Boolean).sort();
  return [
    {
      key: 'category',
      label: 'Escuela',
      values: categories.map((category) => ({
        value: category,
        label: category,
        count: count((course) => course.category === category),
      })),
    },
    {
      key: 'level',
      label: 'Nivel',
      values: [
        { value: 'beginner', label: 'Principiante' },
        { value: 'intermediate', label: 'Intermedio' },
        { value: 'advanced', label: 'Avanzado' },
      ].map((level) => ({ ...level, count: count((course) => course.level === level.value) })),
    },
    {
      key: 'price',
      label: 'Precio',
      values: [
        { value: 'free', label: 'Gratis' },
        { value: 'mid', label: 'Hasta $450.000' },
        { value: 'premium', label: 'Premium' },
      ].map((bracket) => ({
        ...bracket,
        count: count((course) => priceBracket(course.amount) === bracket.value),
      })),
    },
  ];
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
            installments: `4 x ${new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(course.amount / 4))}`,
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
            installments: `6 x ${new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round((course.amount * 1.6) / 6))}`,
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

/** Seeded "mi aprendizaje" so the SH-4 dashboard works offline. */
function mockLearning(currency: string): LearningResult {
  const catalogue = mockCourses(currency);
  const pick = (id: string): AcademyCourse =>
    catalogue.find((course) => course.id === id) ?? catalogue[0];
  const enrollments: readonly EnrolledCourse[] = [
    {
      enrollmentId: 'ENR-DEMO-1',
      course: pick('CMOCK-3'),
      percent: 64,
      lessonCount: 55,
      completedCount: 35,
      lastActivityAt: '2026-07-03',
      completed: false,
    },
    {
      enrollmentId: 'ENR-DEMO-2',
      course: pick('CMOCK-4'),
      percent: 100,
      lessonCount: 12,
      completedCount: 12,
      lastActivityAt: '2026-06-28',
      completed: true,
    },
    {
      enrollmentId: 'ENR-DEMO-3',
      course: pick('CMOCK-1'),
      percent: 22,
      lessonCount: 42,
      completedCount: 9,
      lastActivityAt: '2026-07-05',
      completed: false,
    },
  ];
  const paths: readonly LearningPath[] = [
    {
      id: 'PATH-1',
      title: 'Ruta Full-Stack Developer',
      description: 'De los fundamentos a la arquitectura: Angular, datos y Clean/SOLID.',
      courseIds: ['CMOCK-4', 'CMOCK-1', 'CMOCK-6'],
      percent: 41,
    },
    {
      id: 'PATH-2',
      title: 'Ruta Product & Growth',
      description: 'Diseño de producto y marketing para lanzar y crecer.',
      courseIds: ['CMOCK-2', 'CMOCK-5'],
      percent: 0,
    },
  ];
  return { enrollments, paths };
}

/** A seeded operational view for the instructor cara (cursos + alumnos + Q&A). */
function mockInstructorDesk(): InstructorDeskResult {
  const courses: readonly InstructorCourse[] = [
    { id: 'CMOCK-1', title: 'Angular moderno: signals, zoneless y Web Components', status: 'published', price: 480_000, currency: 'COP', studentCount: 3_240, rating: 4.8, revenue: 1_555_200_000, publishedAt: '2026-05-10' },
    { id: 'CMOCK-4', title: 'Introducción gratuita a la programación', status: 'published', price: 0, currency: 'COP', studentCount: 12_400, rating: 4.6, revenue: 0, publishedAt: '2026-03-02' },
    { id: 'CMOCK-6', title: 'Arquitectura de software: Clean & SOLID en práctica', status: 'published', price: 650_000, currency: 'COP', studentCount: 2_640, rating: 4.9, revenue: 1_716_000_000, publishedAt: '2026-06-01' },
    { id: 'CDRAFT-1', title: 'RxJS avanzado y patrones reactivos', status: 'draft', price: 520_000, currency: 'COP', studentCount: 0, rating: 0, revenue: 0, publishedAt: '' },
  ];
  const students: readonly InstructorStudent[] = [
    { id: 'S-1', name: 'María González', email: 'maria@example.com', courseId: 'CMOCK-1', courseTitle: 'Angular moderno', percent: 78, enrolledAt: '2026-06-20' },
    { id: 'S-2', name: 'Julián Pérez', email: 'julian@example.com', courseId: 'CMOCK-6', courseTitle: 'Clean & SOLID', percent: 34, enrolledAt: '2026-06-25' },
    { id: 'S-3', name: 'Camila Rodríguez', email: 'camila@example.com', courseId: 'CMOCK-1', courseTitle: 'Angular moderno', percent: 100, enrolledAt: '2026-05-30' },
    { id: 'S-4', name: 'Andrés Gómez', email: 'andres@example.com', courseId: 'CMOCK-4', courseTitle: 'Introducción a la programación', percent: 55, enrolledAt: '2026-07-01' },
  ];
  const questions: readonly InstructorQuestion[] = [
    { id: 'Q-1', studentName: 'María González', courseTitle: 'Angular moderno', lessonTitle: 'Signals a fondo', question: '¿Cuándo conviene linkedSignal en vez de computed?', answered: false, createdAt: '2026-07-05' },
    { id: 'Q-2', studentName: 'Julián Pérez', courseTitle: 'Clean & SOLID', lessonTitle: 'Inversión de dependencias', question: '¿La DIP aplica igual en un front zoneless?', answered: false, createdAt: '2026-07-04' },
    { id: 'Q-3', studentName: 'Camila Rodríguez', courseTitle: 'Angular moderno', lessonTitle: 'Web Components', question: '¿Cómo hidrato un custom element dentro del CMS?', answered: true, createdAt: '2026-07-02' },
  ];
  return {
    courses,
    students,
    questions,
    totalStudents: courses.reduce((sum, course) => sum + course.studentCount, 0),
    totalRevenue: courses.reduce((sum, course) => sum + course.revenue, 0),
    averageRating: 4.77,
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
    credentialLine: 'Curso completado · Synergos Academy',
  };
}
