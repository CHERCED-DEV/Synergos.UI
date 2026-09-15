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
  type CourseReview,
  type CourseReviewReportResult,
  type ModerationDecision,
  type ModerationDecisionResult,
  type ModerationItem,
  type CourseReviewResult,
  type CourseReviewSubmission,
  type CourseReviewSummary,
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
 * Una respuesta HTTP no-OK, con su código.
 *
 * Existe porque `response.ok` no distingue un 401 de un 500 (regla 8 del `CLAUDE.md`
 * aplicada al otro extremo del rango): «no has iniciado sesión» y «no pudimos leerlo»
 * son dos pantallas distintas, y con un `Error('HTTP 401')` la única forma de
 * separarlas era parsear un mensaje.
 */
class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

/**
 * Una ESCRITURA que no llegó al servidor. **Lanza; no devuelve nada optimista.**
 *
 * Es la regla 4 del `CLAUDE.md` —degradar una LECTURA no miente; degradar una
 * ESCRITURA sí— sobre el avance del alumno, y la 18 —lo optimista se PINTA; lo que
 * se guarda lo dice el servidor—. El gemelo de `EhrWriteFailedError`
 * (CHERCED-DEV/Synergos.CMS#111), que nació de este mismo defecto en el EHR.
 */
export class AcademyWriteFailedError extends Error {
  constructor(
    readonly endpoint: string,
    override readonly cause: unknown,
  ) {
    super(`Academy write "${endpoint}" did not reach the server.`);
    this.name = 'AcademyWriteFailedError';
  }
}

/**
 * Thin HTTP client over the Educación / LMS backend contract (provided by the
 * backend agent in parallel). Programs against the existing + new contract:
 *
 *  - `GET  /api/academy/courses?q=&category=&level=&price=`  → `{ courses, facets, total }`
 *  - `GET  /api/academy/course/{id}`                        → `{ course, modules:[{lessons}], instructor }`
 *  - `POST /api/academy/enroll`  `{ courseId, student }`    → `{ orderRef, paymentSessionId, amount, currency }` | `{ enrolled:true }`
 *  - `POST /api/academy/confirm` `{ orderRef }`             → `{ status, enrollmentId }`
 *  - `GET  /api/academy/progress?course=`                   → `{ completedLessonIds, percent }`
 *  - `POST /api/academy/progress` `{ course, lessonId }`    → `{ percent }`
 *  - `GET  /api/academy/certificate?course=`                → `{ certificate: {…} | null }`
 *  - `GET  /api/academy/learning`                            → `{ enrollments, paths }` — el alumno sale de la SESIÓN
 *  - `GET  /api/academy/instructor/courses` anida cada fila bajo `course` y no trae
 *    `students`/`questions`: la consola SH-5 cae al mock siempre (CMS#102)
 *  - `POST /api/academy/course`  `{ title, summary, modules:[{title}] }` → `{ courseId }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. Every mock path flips the
 * `degraded` flag so the shell can surface a "datos de ejemplo" notice.
 *
 * **Tres lecturas NO degradan, y las tres por la misma razón** (reglas 4, 14 y 15):
 * el certificado (es una prueba, no contenido), «mi aprendizaje» (un expediente
 * vacío es una respuesta, no un fallo — y un invitado que ve cursos de ejemplo cree
 * que tiene matrículas) y lo que devuelva un 401.
 *
 * **`markComplete` ya no miente** (CHERCED-DEV/Synergos.CMS#116). Devolvía el
 * porcentaje optimista del llamador cuando el POST no llegaba, así que la barra
 * avanzaba sobre un servidor que no guardó nada: el alumno cerraba, volvía, y su
 * avance no estaba. Hoy **lanza** `AcademyWriteFailedError` y quien llama decide.
 *
 * **Lo que sigue mintiendo y NO entra aquí:** `enroll` y `confirm` fabrican un
 * `orderRef`/`enrollmentId` cuando el borde no contesta, o sea una matrícula que
 * nadie activó. Es la misma regla 4 y pide su propio ticket, porque arreglarlo
 * cruza el asistente de compra entero (SH-3) y no sólo este cliente.
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

  /**
   * `POST /api/academy/courses/{id}/reviews` — publica la opinión de un curso (#28).
   *
   * **No degrada a mock**, igual que su gemelo de la Tienda: fingir una escritura
   * que no ocurrió es peor que el error (ADR 0112). El endpoint todavía no existe,
   * así que hoy esto contesta `failed` de verdad y la pantalla lo dice — un
   * «gracias» sobre un servidor que no recibió nada sería el defecto #26.
   */
  async submitCourseReview(
    apiBase: string,
    courseId: string,
    submission: CourseReviewSubmission,
  ): Promise<CourseReviewResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/courses/${encodeURIComponent(courseId)}/reviews`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      if (response.ok) {
        // **202 no es 201** (#31): un borde que encola para revisión del docente
        // contesta 202, y `response.ok` no los distingue.
        return { ok: true, pending: response.status === 202 };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 403:
          return { ok: false, reason: 'not-student' };
        case 400:
          return { ok: false, reason: 'invalid' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      // Red caída NO es «no puedes opinar»: el mensaje invita a reintentar.
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * El docente decide sobre una opinión en cola (#31).
   *
   * **No degrada a mock.** Dejar una opinión publicada mientras la pantalla dice
   * que se rechazó es la regla 4 de `CLAUDE.md` sobre la escritura que más
   * consecuencias tiene: alguien queda expuesto y el docente cree que lo atendió.
   */
  async decideModeration(
    apiBase: string,
    reviewId: string,
    decision: ModerationDecision,
  ): Promise<ModerationDecisionResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/moderation/${encodeURIComponent(reviewId)}/${decision}`;
    try {
      const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
      if (response.ok) {
        return { ok: true };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 403:
          return { ok: false, reason: 'forbidden' };
        // Otra persona ya decidió. NO es un fallo de quien pulsa: la fila sale de
        // la cola igual, y decirle «falló» la dejaría pulsando sobre algo resuelto.
        case 409:
          return { ok: false, reason: 'already-decided' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  /** Reporta una reseña (#31). Sin degradar a mock: ver regla 4 de `CLAUDE.md`. */
  async reportCourseReview(
    apiBase: string,
    reviewId: string,
  ): Promise<CourseReviewReportResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/reviews/${encodeURIComponent(reviewId)}/reports`;
    try {
      const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
      if (response.ok) {
        return { ok: true };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 409:
          return { ok: false, reason: 'already-reported' };
        case 404:
          return { ok: false, reason: 'not-found' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

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

  /** El `?student=` tampoco va aquí: el borde lo ignora desde que cerró el IDOR. */
  async progress(apiBase: string, courseId: string): Promise<CourseProgress> {
    const params = new URLSearchParams();
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

  /**
   * Marca una lección como completa. **Lanza si no llega; no devuelve un porcentaje
   * de relleno.**
   *
   * Lo que había: el `catch` devolvía el `fallbackPercent` que le pasaba el aula —el
   * mismo número que el aula acababa de calcular en local—, así que la barra
   * confirmaba un avance que el servidor no guardó. El alumno cerraba, volvía, y la
   * lección estaba sin marcar: no había forma de distinguir «guardado» de «no salió»
   * mirando la pantalla, porque las dos se veían igual.
   *
   * **El porcentaje que vale es el del servidor**, y no coincide con el de aquí: el
   * borde lo calcula contra el currículum entero del expediente, no contra las
   * lecciones que esta pantalla tiene cargadas.
   */
  async markComplete(
    apiBase: string,
    courseId: string,
    lessonId: string,
  ): Promise<ProgressUpdate> {
    const url = `${apiBase}/progress`;
    try {
      // Sin `student`: el borde lo tomaba del cuerpo y eso permitía marcar lecciones
      // completadas en el expediente de OTRO. Hoy sale del gate y el campo no decide
      // nada — mandarlo sólo mantiene viva la idea de que sí.
      const data = await this.postJson(url, { course: courseId, lessonId });
      const update = normalizeProgressUpdate(data);
      if (update) {
        return update;
      }
      throw new Error('progress-update-shape');
    } catch (error) {
      this.writeFailed('POST /api/academy/progress', error);
    }
  }

  // ─── Certificate (verifiable credential) ─────────────────────────────────────

  /**
   * La credencial del alumno, o `null` cuando todavía no hay una — o cuando no se
   * pudo recuperar.
   *
   * **No degrada a mock, y ésa es la diferencia con el catálogo.** Degradar una
   * LECTURA no miente mientras lo leído sea contenido; un certificado no es
   * contenido, es una PRUEBA: existe para que un tercero le crea. Un id inventado
   * con una `verifyUrl` que no resuelve se imprime igual que uno real y viaja sin el
   * cartel de «datos de ejemplo» que se queda en la página.
   */
  async certificate(apiBase: string, courseId: string): Promise<Certificate | null> {
    const params = new URLSearchParams();
    if (courseId) {
      params.set('course', courseId);
    }
    const query = params.toString();
    const url = `${apiBase}/certificate${query ? `?${query}` : ''}`;
    try {
      // `null` es una respuesta legítima del borde: «todavía no la ganaste».
      return normalizeCertificate(await this.getJson(url));
    } catch (error) {
      this.markDegraded('GET /api/academy/certificate', error);
      return null;
    }
  }

  // ─── Mi aprendizaje (enrolled courses + paths) ───────────────────────────────

  /**
   * El expediente del alumno. **No degrada a mock y no manda `?student=`.**
   *
   * Lo que había: dos listas vacías hacían `null` al normalizador, el `catch` servía
   * `mockLearning()` y el alumno **sin matrículas** —el que estrena la pantalla— veía
   * tres cursos que no compró. El estado vacío honesto no se podía alcanzar.
   *
   * Y el `?student=` ya no lo lee nadie: el borde toma al alumno de la sesión desde
   * que cerró el IDOR (CMS#102, `f485cd0`). Mandarlo era `sort=newest` otra vez, con
   * el agravante de que era el correo TECLEADO en el checkout mientras el aula
   * escribe el progreso con el del gate: lo que alguien marcaba en clase podía no
   * verse aquí.
   *
   * Un 401 es `anon`, no un error: se pide iniciar sesión. Degradarlo a mock le diría
   * a un invitado que tiene matrículas.
   */
  async learning(apiBase: string, currency: string): Promise<LearningResult> {
    const url = `${apiBase}/learning`;
    try {
      const data = await this.getJson(url);
      const result = normalizeLearning(data, currency);
      if (result) {
        return this.mergeLearning(result);
      }
      throw new Error('learning-shape');
    } catch (error) {
      if (error instanceof HttpStatusError && (error.status === 401 || error.status === 403)) {
        this.#logger.warn('Academy API "GET /api/academy/learning" — sin sesión.', error);
        return { status: 'anon' };
      }
      this.#logger.warn('Academy API "GET /api/academy/learning" unavailable.', error);
      return { status: 'unreadable' };
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

  /**
   * Una matrícula hecha en esta sesión ya está ACUSADA por el borde (`enroll`
   * devolvió su `enrollmentId`), así que ponerla arriba no inventa nada: evita que
   * el alumno vuelva del «¡Ya estás inscrito!» a un «todavía no te has inscrito»
   * mientras el expediente se pone al día.
   */
  private mergeLearning(base: {
    readonly enrollments: readonly EnrolledCourse[];
    readonly paths: readonly LearningPath[];
  }): LearningResult {
    if (this.#enrollments.length === 0) {
      return { status: 'ok', ...base };
    }
    const inSessionIds = new Set(this.#enrollments.map((entry) => entry.course.id));
    const rest = base.enrollments.filter((entry) => !inSessionIds.has(entry.course.id));
    return { status: 'ok', paths: base.paths, enrollments: [...this.#enrollments, ...rest] };
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

  /**
   * El curso recién creado va arriba **hasta que el servidor lo devuelve**, y
   * entonces gana el del servidor: sin el dedup salía DOS veces —una con lo que
   * este proceso recordaba y otra con lo que el borde sabe—, y la de arriba era la
   * que menos sabe.
   */
  private mergeInstructorDesk(base: InstructorDeskResult): InstructorDeskResult {
    if (this.#createdCourses.length === 0) {
      return base;
    }
    const delServidor = new Set(base.courses.map((course) => course.id));
    const pendientes = this.#createdCourses.filter((course) => !delServidor.has(course.id));
    return { ...base, courses: [...pendientes, ...base.courses] };
  }

  // ─── Create a course (SH-6 authoring) ─────────────────────────────────────────

  async createCourse(
    apiBase: string,
    body: CreateCourseRequest,
    currency: string,
  ): Promise<CreateCourseResult> {
    const url = `${apiBase}/course`;
    try {
      const data = await this.postJson(url, toCourseDraftWire(body));
      const result = normalizeCreate(data);
      if (result) {
        this.seedCreated(result.id, body, currency);
        return result;
      }
      throw new Error('create-shape');
    } catch (error) {
      this.markDegraded('POST /api/academy/course', error);
      // Regla 4: degradar una ESCRITURA miente. Nada de id inventado y —sobre todo—
      // nada de sembrar el curso en la consola: eso enseñaba la prueba de la mentira
      // en la pantalla de al lado. El llamador decide qué decirle al instructor.
      return { id: '', persisted: false };
    }
  }

  /** Reflect a freshly-created course in the in-memory instructor console. */
  private seedCreated(id: string, body: CreateCourseRequest, currency: string): void {
    const course: InstructorCourse = {
      id,
      title: body.title,
      // El borde no dice en qué estado quedó (`{ courseId }` y nada más), así que
      // aquí no consta. En cuanto la consola se relee, gana la fila del servidor.
      status: null,
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
      response.ok ? response.json() : Promise.reject(new HttpStatusError(response.status)),
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

  /**
   * Una ESCRITURA que no llegó. **No marca `degraded` y no devuelve nada**: el cartel
   * de «datos de ejemplo» es para las LECTURAS, y aquí no hay ningún dato de ejemplo
   * que enseñar — hay algo que no se guardó, y quien llama tiene que saberlo.
   */
  private writeFailed(endpoint: string, error: unknown): never {
    this.#logger.warn(`Academy API "${endpoint}" unavailable — nothing was saved.`, error);
    throw new AcademyWriteFailedError(endpoint, error);
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

/**
 * `null` cuando la clave falta o trae algo que no es un estado conocido.
 *
 * Resolvía `'published'`, o sea que la ausencia AFIRMABA en vez de dejar hueco: un
 * borrador se veía publicado. Es la forma de la regla 15 sobre un enum.
 */
function readCourseStatus(value: unknown): CourseStatus | null {
  const raw = readString(value).toLowerCase();
  return raw === 'draft' || raw === 'review' || raw === 'published' ? raw : null;
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

/**
 * Las facetas cuyo valor viaja de a UNO al backend (#18).
 *
 * `CatalogCriteria` lleva `category`, `level` y `price` como campos sueltos, así que el
 * cliente se quedaba con el primer valor y descartaba el resto — con el shell pintando
 * casillas. Declararlas de valor único hace que lo que se marca sea lo que se filtra.
 */
const FACETAS_DE_UN_VALOR: ReadonlySet<string> = new Set(['category', 'level', 'price']);

function kindPorDefecto(clave: string): string {
  return FACETAS_DE_UN_VALOR.has(clave) ? 'SingleSelect' : 'MultiSelect';
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
        // Sin kind el contrato dice MultiSelect; estas tres viajan de a una (#18).
        kind: readString(entry['kind']).trim() || kindPorDefecto(key),
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
    reviews: normalizeCourseReviews(value['reviews']),
    reviewSummary: normalizeCourseReviewSummary(value['reviewSummary']),
    // Ausente = NO puede. Es el default seguro: ofrecer el formulario a quien el
    // servidor no autorizó es prometer algo que va a rebotar con 403.
    canReview: value['canReview'] === true,
  };
}

function normalizeCourseReviews(value: unknown): readonly CourseReview[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): CourseReview | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const body = readString(entry['body']).trim();
      if (!id || !body) {
        return null;
      }
      const reply = readString(entry['reply']).trim();
      return {
        id,
        author: readString(entry['author']).trim() || 'Estudiante',
        rating: Math.min(5, Math.max(1, Math.round(readNumber(entry['rating'])))),
        title: readString(entry['title']).trim(),
        body,
        date: readString(entry['date']).trim(),
        verified: entry['verified'] === true,
        ...(reply ? { reply } : {}),
      };
    })
    .filter((entry): entry is CourseReview => entry !== null);
}

function normalizeCourseReviewSummary(value: unknown): CourseReviewSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawDist = Array.isArray(value['distribution']) ? value['distribution'] : [];
  const rawCrit = Array.isArray(value['criteria']) ? value['criteria'] : [];
  return {
    average: readNumber(value['average']),
    count: Math.trunc(readNumber(value['count'])),
    distribution: rawDist
      .map((entry) =>
        isRecord(entry)
          ? {
              stars: Math.min(5, Math.max(1, Math.round(readNumber(entry['stars'])))),
              count: Math.trunc(readNumber(entry['count'])),
            }
          : null,
      )
      .filter((entry): entry is { stars: number; count: number } => entry !== null),
    criteria: rawCrit
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }
        const id = readString(entry['id']).trim();
        return id
          ? { id, label: readString(entry['label']).trim() || id, score: readNumber(entry['score']) }
          : null;
      })
      .filter((entry): entry is { id: string; label: string; score: number } => entry !== null),
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
  // El borde envuelve: `{ certificate: {…} | null }`. Se acepta también la credencial
  // desnuda, como ya hace `normalizeDetail` con `course`.
  const record = isRecord(value) && isRecord(value['certificate']) ? value['certificate'] : value;
  if (!isRecord(record)) {
    return null;
  }
  const id = readString(record['id']).trim() || readString(record['certificateId']).trim();
  const verifyUrl = readString(record['verifyUrl']).trim();
  // Sin id o sin URL de verificación no hay credencial: había un fallback que
  // inventaba la URL a partir del id, y una credencial que no se puede verificar
  // pintada con el sello de «Verificable» es una prueba falsa, no un dato incompleto.
  if (!id || !verifyUrl) {
    return null;
  }
  return {
    id,
    studentName: readString(record['studentName']).trim() || 'Estudiante',
    courseTitle: readString(record['courseTitle']).trim() || 'Curso',
    issuedAt: readString(record['issuedAt']).trim() || new Date().toISOString(),
    verifyUrl,
    credentialLine: readString(record['credentialLine']).trim() || undefined,
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

/**
 * `null` sólo cuando la respuesta NO tiene la forma del contrato — o sea cuando no
 * se puede saber qué contestó el servidor. **Dos listas vacías son una respuesta
 * correcta**: «no tienes matrículas». Que aquí devolviera `null` es lo que hacía
 * inalcanzable el estado vacío honesto y mandaba al alumno nuevo al mock.
 */
function normalizeLearning(
  value: unknown,
  fallbackCurrency: string,
): { enrollments: readonly EnrolledCourse[]; paths: readonly LearningPath[] } | null {
  if (!isRecord(value) || !Array.isArray(value['enrollments'])) {
    return null;
  }
  const rawEnrollments = value['enrollments'];
  const rawPaths = Array.isArray(value['paths']) ? value['paths'] : [];
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

function normalizeModerationItem(value: unknown): ModerationItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  // `reported` sólo si el servidor lo dice: por defecto es una pendiente, que es la
  // lectura conservadora — tratar una pendiente como reportada la subiría de
  // prioridad sin que nadie hubiera avisado.
  const reason = readString(value['reason']).trim() === 'reported' ? 'reported' : 'pending';
  return {
    id,
    author: readString(value['author']).trim() || 'Estudiante',
    courseTitle: readString(value['courseTitle']).trim() || 'Curso',
    rating: Math.min(5, Math.max(0, Math.trunc(readNumber(value['rating'])))),
    body: readString(value['body']).trim(),
    createdAt: readString(value['createdAt']).trim(),
    reason,
    reportCount: Math.max(0, Math.trunc(readNumber(value['reportCount']))),
  };
}

function normalizeInstructorDesk(value: unknown): InstructorDeskResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawCourses = Array.isArray(value['courses']) ? value['courses'] : [];
  const rawStudents = Array.isArray(value['students']) ? value['students'] : [];
  const rawQuestions = Array.isArray(value['questions']) ? value['questions'] : [];
  const rawModeration = Array.isArray(value['moderation']) ? value['moderation'] : [];
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
    moderation: rawModeration
      .map((entry) => normalizeModerationItem(entry))
      .filter((entry): entry is ModerationItem => entry !== null),
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

/**
 * El cuerpo que EXIGE `POST /api/academy/course`.
 *
 * `modules` es una lista de OBJETOS (`CourseDraftModuleRequest` = `{ title, lessons }`),
 * no de cadenas: mandar `["Módulo 1"]` es `400 $.modules[0]` — medido contra los
 * `record` del controller, siempre, sin una sola excepción. Y lo que acá es
 * `subtitle` el borde lo llama `summary`; con el nombre de la UI se descarta en
 * silencio, porque System.Text.Json ignora los miembros que no mapea.
 */
function toCourseDraftWire(body: CreateCourseRequest): Record<string, unknown> {
  return {
    title: body.title,
    summary: body.subtitle,
    category: body.category,
    level: body.level,
    price: body.price,
    modules: body.modules.map((title) => ({ title, lessons: [] })),
  };
}

function normalizeCreate(value: unknown): CreateCourseResult | null {
  if (!isRecord(value)) {
    return null;
  }
  // El borde responde `{ courseId }`; se acepta también `id` por si cambia.
  const id = readString(value['courseId']).trim() || readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return { id, persisted: true };
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
      kind: kindPorDefecto('category'),
      values: categories.map((category) => ({
        value: category,
        label: category,
        count: count((course) => course.category === category),
      })),
    },
    {
      key: 'level',
      label: 'Nivel',
      kind: kindPorDefecto('level'),
      values: [
        { value: 'beginner', label: 'Principiante' },
        { value: 'intermediate', label: 'Intermedio' },
        { value: 'advanced', label: 'Avanzado' },
      ].map((level) => ({ ...level, count: count((course) => course.level === level.value) })),
    },
    {
      key: 'price',
      label: 'Precio',
      kind: kindPorDefecto('price'),
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
      // El servidor ordena por FECHA DE PUBLICACIÓN descendente, «no consta» al
      // final y empate por título. `copy.reverse()` describía un servidor que no
      // existe (regla 10): daba un orden que no es el que el desplegable promete,
      // así que el mock enseñaba una cosa y el borde real otra.
      return copy.sort((a, b) => {
        const fechaA = MOCK_PUBLISHED_AT[a.id] ?? '';
        const fechaB = MOCK_PUBLISHED_AT[b.id] ?? '';
        if (fechaA !== fechaB) {
          // Sin fecha va al final, no al principio: «no consta» no es «recentísimo».
          if (!fechaA) {
            return 1;
          }
          if (!fechaB) {
            return -1;
          }
          return fechaB.localeCompare(fechaA);
        }
        return a.title.localeCompare(b.title);
      });
    default:
      return copy.sort((a, b) => b.studentCount - a.studentCount);
  }
}

/**
 * Cuándo se publicó cada curso del catálogo de ejemplo.
 *
 * Va aparte y NO en `AcademyCourse`: `CourseDto` no emite ninguna fecha, así que
 * declararla en el tipo del contrato sería la UI leyendo una clave que nadie manda
 * —el defecto que G-6 vigila, en la dirección contraria—. El orden «más recientes»
 * lo resuelve el servidor; esto sólo le da al mock la misma regla.
 *
 * `CMOCK-5` no tiene: es el caso de «no consta», que va al final.
 */
const MOCK_PUBLISHED_AT: Readonly<Record<string, string>> = {
  'CMOCK-1': '2026-05-10',
  'CMOCK-2': '2026-07-18',
  'CMOCK-3': '2026-02-02',
  'CMOCK-4': '2026-03-02',
  'CMOCK-6': '2026-07-18',
};

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
    // Demo de reseñas: su trabajo es que la funcionalidad se VEA. El servidor real
    // emite lo mismo, y el envío sigue fallando a la vista porque el endpoint no
    // existe todavía (#28).
    reviews: [
      {
        id: 'ACR-1',
        author: 'Valentina M.',
        rating: 5,
        title: 'El temario vale cada peso',
        body: 'Los proyectos son reales, no ejercicios de juguete. Terminé con algo que pude mostrar en una entrevista.',
        date: '14 de agosto de 2026',
        verified: true,
      },
      {
        id: 'ACR-2',
        author: 'Julián O.',
        rating: 4,
        title: 'Muy bueno, pide dedicación',
        body: 'El ritmo es exigente. Si no puedes dedicarle unas horas por semana se te acumula.',
        date: '2 de agosto de 2026',
        verified: true,
        reply: 'Gracias Julián — sumamos una guía de ritmo sugerido al inicio del módulo 2.',
      },
      {
        id: 'ACR-3',
        author: 'Daniela C.',
        rating: 3,
        title: '',
        body: 'Buen contenido pero algunos videos están desactualizados frente a la última versión.',
        date: '28 de julio de 2026',
        verified: true,
      },
    ],
    reviewSummary: {
      average: 4.3,
      count: 214,
      distribution: [
        { stars: 5, count: 132 },
        { stars: 4, count: 54 },
        { stars: 3, count: 18 },
        { stars: 2, count: 6 },
        { stars: 1, count: 4 },
      ],
      // Los criterios de un CURSO: no son los de un hotel ni los de un producto.
      criteria: [
        { id: 'claridad', label: 'Claridad', score: 4.6 },
        { id: 'utilidad', label: 'Utilidad práctica', score: 4.4 },
        { id: 'ritmo', label: 'Ritmo', score: 3.8 },
      ],
    },
    canReview: true,
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

/** A seeded operational view for the instructor cara (cursos + alumnos + Q&A). */
function mockInstructorDesk(): InstructorDeskResult {
  const courses: readonly InstructorCourse[] = [
    { id: 'CMOCK-1', title: 'Angular moderno: signals, zoneless y Web Components', status: 'published', price: 480_000, currency: 'COP', studentCount: 3_240, rating: 4.8, revenue: 1_555_200_000, publishedAt: '2026-05-10' },
    { id: 'CMOCK-4', title: 'Introducción gratuita a la programación', status: 'published', price: 0, currency: 'COP', studentCount: 12_400, rating: 4.6, revenue: 0, publishedAt: '2026-03-02' },
    { id: 'CMOCK-6', title: 'Arquitectura de software: Clean & SOLID en práctica', status: 'published', price: 650_000, currency: 'COP', studentCount: 2_640, rating: 4.9, revenue: 1_716_000_000, publishedAt: '2026-06-01' },
    { id: 'CDRAFT-1', title: 'RxJS avanzado y patrones reactivos', status: 'draft', price: 520_000, currency: 'COP', studentCount: 0, rating: 0, revenue: 0, publishedAt: '' },
  ];
  const students: readonly InstructorStudent[] = [
    { id: 'S-1', name: 'María González', courseId: 'CMOCK-1', courseTitle: 'Angular moderno', percent: 78, enrolledAt: '2026-06-20' },
    { id: 'S-2', name: 'Julián Pérez', courseId: 'CMOCK-6', courseTitle: 'Clean & SOLID', percent: 34, enrolledAt: '2026-06-25' },
    { id: 'S-3', name: 'Camila Rodríguez', courseId: 'CMOCK-1', courseTitle: 'Angular moderno', percent: 100, enrolledAt: '2026-05-30' },
    { id: 'S-4', name: 'Andrés Gómez', courseId: 'CMOCK-4', courseTitle: 'Introducción a la programación', percent: 55, enrolledAt: '2026-07-01' },
  ];
  const questions: readonly InstructorQuestion[] = [
    { id: 'Q-1', studentName: 'María González', courseTitle: 'Angular moderno', lessonTitle: 'Signals a fondo', question: '¿Cuándo conviene linkedSignal en vez de computed?', answered: false, createdAt: '2026-07-05' },
    { id: 'Q-2', studentName: 'Julián Pérez', courseTitle: 'Clean & SOLID', lessonTitle: 'Inversión de dependencias', question: '¿La DIP aplica igual en un front zoneless?', answered: false, createdAt: '2026-07-04' },
    { id: 'Q-3', studentName: 'Camila Rodríguez', courseTitle: 'Angular moderno', lessonTitle: 'Web Components', question: '¿Cómo hidrato un custom element dentro del CMS?', answered: true, createdAt: '2026-07-02' },
  ];
  // Los dos motivos, que NO se atienden igual — la reportada ya está pública
  // haciendo daño. **Van en orden de LLEGADA a propósito**, con la pendiente
  // primero: si el mock ya viniera ordenado, el spec de la prioridad pasaría en
  // verde con el `sort` quitado y no estaría vigilando nada. Comprobado mutando.
  const moderation: readonly ModerationItem[] = [
    {
      id: 'MOD-2',
      author: 'Julián Pérez',
      courseTitle: 'Clean & SOLID',
      rating: 4,
      body: 'Muy completo. El módulo de inversión de dependencias se me hizo largo.',
      createdAt: '2026-07-04',
      reason: 'pending',
      reportCount: 0,
    },
    {
      id: 'MOD-3',
      author: 'Sofía Marín',
      courseTitle: 'Angular moderno',
      rating: 2,
      body: 'El audio de las últimas tres lecciones está cortado.',
      createdAt: '2026-07-05',
      reason: 'reported',
      // **Cero a propósito.** El normalizador deja el conteo en 0 cuando el
      // servidor no lo manda, y una reportada sin conteo tiene que seguir yendo
      // por delante de una pendiente: sin eso, ordenar sólo por conteo daría el
      // mismo resultado que ordenar bien —las pendientes siempre valen 0— y la
      // regla del motivo sería código muerto. Comprobado mutando.
      reportCount: 0,
    },
    {
      id: 'MOD-1',
      author: 'Andrés Gómez',
      courseTitle: 'Angular moderno',
      rating: 1,
      body: 'Compren el curso de otro lado, acá dejo mi WhatsApp para venderlo más barato.',
      createdAt: '2026-07-06',
      reason: 'reported',
      reportCount: 3,
    },
  ];
  return {
    courses,
    students,
    questions,
    moderation,
    totalStudents: courses.reduce((sum, course) => sum + course.studentCount, 0),
    totalRevenue: courses.reduce((sum, course) => sum + course.revenue, 0),
    averageRating: 4.77,
  };
}

// Acá vivía `buildMockCertificate`, que fabricaba `CERT-<random>` con una `verifyUrl`
// a un dominio que no existe. Se fue con el defecto: un catálogo de ejemplo es una
// demo, una credencial de ejemplo es una credencial falsa.
