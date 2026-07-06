/**
 * Domain model for the Educación vertical's <c>&lt;synergos-academy&gt;</c> — a real
 * LMS app (Udemy + Coursera + Platzi, doc 21 §2.4 + `deep-research/educacion.md`)
 * rebuilt **v2** as a **role-switch, hash-routed multi-page SPA** and the Ola-5
 * consumer of the reusable shell catalogue `@synergos/shells`:
 *
 *  - **ALUMNO (público):** SH-1 `syn-discovery-shell` catálogo (facetas es-CO:
 *    escuela/categoría · nivel · precio) → SH-2 `syn-detail-shell` PDD del curso
 *    (currículum acordeón módulos→lecciones · instructor · planes) → SH-3
 *    `syn-checkout-wizard` inscripción sobre el motor (cursos gratis = enroll
 *    directo) → **AULA gated** (reproductor + currículum con progreso + Q&A con
 *    `<synergos-comments-widget>` + recursos + tareas + quiz) → SH-4
 *    `syn-account-shell` "mi aprendizaje" (cursos · progreso · rutas) → SH-10
 *    `syn-credential-wallet` certificado verificable.
 *  - **INSTRUCTOR (role-switch):** SH-5 `syn-console-shell` (mis cursos · alumnos ·
 *    ingresos · Q&A dashboard · performance) + SH-6 `syn-authoring-wizard`
 *    crear/editar curso (datos→currículum builder→precio→publicar).
 *
 * The academy speaks the LMS's course/module/lesson/progress language on the
 * catalogue + classroom side, but funnels enrolment into the engine's
 * vertical-agnostic <c>SessionItem[]</c> cart behind a single <c>Pricing</c>, then
 * one checkout — exactly the storefront's <c>seleccionar → pagar → confirmar</c>.
 * Here a cart line is the chosen course+plan and "confirmed" means **matrícula
 * activa** (the classroom unlocks). Free courses skip payment (enroll directo).
 *
 * Pure TS (no Angular imports besides the engine's `SessionItemKind` type) so it
 * can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The flow id the engine routes on — one strategy owns it. */
export const ACADEMY_FLOW = 'academy';

/** Every academy cart line is a `course` kind for the engine. */
export const ACADEMY_KIND: SessionItemKind = 'course';

/** Which cara of the app the user is on (role-switch). */
export type AcademyRole = 'student' | 'instructor';

/**
 * The high-level phase / route within the ALUMNO cara (drives the hash router
 * `#/academy/...`).
 */
export type AcademyView =
  | 'catalog' // SH-1 search + facets listing (home del dominio)
  | 'course' // SH-2 course PDD (currículum · instructor · planes)
  | 'checkout' // SH-3 enrolment wizard (plan → datos → revisar)
  | 'enrolled' // post-enrolment success bridge → aula
  | 'classroom' // the aula / course player (gated)
  | 'learning' // SH-4 "mi aprendizaje": cursos · progreso · rutas
  | 'certificate'; // SH-10 verifiable credential wallet at 100%

/**
 * The section within the INSTRUCTOR cara. Rendered inside the SH-5 console-shell
 * as its active section; `create` swaps to the SH-6 authoring wizard.
 */
export type InstructorView =
  | 'courses' // mis cursos (tabla + KPIs)
  | 'students' // alumnos matriculados (tabla)
  | 'qa' // Q&A dashboard (cola de preguntas)
  | 'performance' // performance / ingresos (KPIs + reporte)
  | 'create'; // SH-6 authoring wizard: crear/editar curso

/** The enrolment checkout wizard step. */
export type EnrollStep = 'plan' | 'student' | 'review';

/** Course difficulty level — a canonical LMS facet. */
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

/** Catalogue sort options. Maps 1:1 to the API `sort` query param. */
export type AcademySortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

// ─── Catalogue: courses ──────────────────────────────────────────────────────

/**
 * One course card / summary as returned by `GET /api/academy/courses`. `amount` is
 * in **major units** of `currency` (es-CO formatted in the view); the engine cart
 * stores minor units. `amount === 0` marks a free course (enroll directo).
 */
export interface AcademyCourse {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** Lead price (cheapest plan) in major units. `0` → gratis. */
  readonly amount: number;
  /** Optional pre-discount price (struck through) in major units. */
  readonly listAmount?: number;
  readonly currency: string;
  readonly category: string;
  readonly level: CourseLevel;
  /** Total course duration in minutes. */
  readonly durationMinutes: number;
  readonly lessonCount: number;
  readonly rating: number;
  readonly studentCount: number;
  readonly instructorName: string;
  /** Cover image URL (optional — view degrades to a placeholder). */
  readonly cover: string;
  /** Short freeform chips (e.g. "Certificado", "Acceso de por vida"). */
  readonly badges: readonly string[];
}

/** A single lesson within a section — the smallest curriculum unit. */
export interface AcademyLesson {
  readonly id: string;
  readonly title: string;
  /** Lesson kind drives the curriculum icon. */
  readonly kind: LessonKind;
  /** Lesson length in minutes. */
  readonly durationMinutes: number;
  /** Streaming/embed reference for the video player (oembed/MediaPicker URL). */
  readonly videoRef: string;
  /** Editorial body / transcript (shape of a `postPage` — polymorphic with Blogs). */
  readonly body: string;
  /** Free preview lesson (playable before enrolling). */
  readonly preview: boolean;
  /** Downloadable resources attached to this lesson. */
  readonly resources: readonly LessonResource[];
  /** Whether this lesson accepts an assignment submission. */
  readonly allowAssignment: boolean;
}

/** Lesson media kind — maps to the curriculum row icon. */
export type LessonKind = 'video' | 'reading' | 'quiz' | 'assignment';

/** A downloadable resource (PDF, dataset, slides) for a lesson. */
export interface LessonResource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  /** Coarse type label shown as a chip ("PDF", "ZIP", "XLSX"). */
  readonly fileType: string;
  /** Human-readable size ("2.4 MB"). */
  readonly size: string;
}

/** A curriculum section grouping ordered lessons. */
export interface AcademySection {
  readonly id: string;
  readonly title: string;
  readonly lessons: readonly AcademyLesson[];
}

/** A price/access plan for a course (contado, premium con mentoría, …). */
export interface AcademyPlan {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Total price for this plan in major units. `0` → gratis. */
  readonly amount: number;
  /** Optional installment hint, already formatted by the API ("4 x $120.000"). */
  readonly installments?: string;
  /** Bullet perks for the plan card. */
  readonly perks: readonly string[];
  /** Highlight the recommended plan. */
  readonly featured: boolean;
}

/** The course author/instructor (shape of the Blogs author — polymorphic). */
export interface AcademyInstructor {
  readonly name: string;
  readonly headline: string;
  readonly bio: string;
  readonly avatar: string;
  readonly courseCount: number;
  readonly studentCount: number;
  readonly rating: number;
}

/** The full course-page payload as returned by `GET /api/academy/course/{id}`. */
export interface CourseDetail {
  readonly course: AcademyCourse;
  readonly description: string;
  /** "Lo que aprenderás" bullets. */
  readonly outcomes: readonly string[];
  readonly sections: readonly AcademySection[];
  readonly plans: readonly AcademyPlan[];
  readonly instructor: AcademyInstructor;
}

// ─── Catalogue search ────────────────────────────────────────────────────────

/** A facet group (escuela/categoría · nivel · precio) with selectable values. */
export interface AcademyFacet {
  /** Stable key used in the search query. */
  readonly key: string;
  readonly label: string;
  readonly values: readonly AcademyFacetValue[];
}

/** One selectable value within a facet group, with a result count. */
export interface AcademyFacetValue {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

/** `GET /api/academy/courses` response (faceted). */
export interface CatalogResult {
  readonly courses: readonly AcademyCourse[];
  readonly facets: readonly AcademyFacet[];
  readonly total: number;
}

/** The active query the catalogue drives the search with. */
export interface CatalogCriteria {
  readonly q: string;
  readonly category: string;
  /** Empty string means "all levels". */
  readonly level: CourseLevel | '';
  /** Price bracket facet value (empty = any). */
  readonly price: string;
  readonly sort: AcademySortKey;
}

// ─── Enrolment / checkout contract (API) ─────────────────────────────────────

/** Student contact captured once for the enrolment. */
export interface AcademyStudent {
  readonly name: string;
  readonly email: string;
}

/**
 * `POST /api/academy/enroll` response. A paid course opens one PSP session; a free
 * course short-circuits to `{ enrolled: true }` (modelled here as `free: true`).
 */
export interface EnrollResult {
  readonly orderRef: string;
  readonly paymentSessionId: string;
  readonly amount: number;
  readonly currency: string;
  /** `true` when the course was free → no payment, enrolment already active. */
  readonly free: boolean;
  /** Set directly for free enrolments. */
  readonly enrollmentId?: string;
}

/** `POST /api/academy/confirm` response — the matrícula activated. */
export interface EnrollConfirmation {
  readonly status: string;
  readonly enrollmentId: string;
}

// ─── Progress contract (API) ─────────────────────────────────────────────────

/** `GET /api/academy/progress` response — the student's course progress. */
export interface CourseProgress {
  readonly completedLessonIds: readonly string[];
  /** Percent complete (0–100). */
  readonly percent: number;
}

/** `POST /api/academy/progress` response — recomputed percent after a mark. */
export interface ProgressUpdate {
  readonly percent: number;
}

// ─── Mi aprendizaje (SH-4 account) ───────────────────────────────────────────

/**
 * One enrolled course row in "mi aprendizaje" (SH-4 inbox). Aggregates the course
 * summary with the student's live progress so the account timeline can render the
 * continue-learning CTA and the completion state.
 */
export interface EnrolledCourse {
  readonly enrollmentId: string;
  readonly course: AcademyCourse;
  /** Percent complete (0–100). */
  readonly percent: number;
  /** Total lessons in the course (denominator of the progress bar). */
  readonly lessonCount: number;
  /** Lessons already completed. */
  readonly completedCount: number;
  /** ISO date of the last activity (drives "última actividad"). */
  readonly lastActivityAt: string;
  /** `true` once progress reaches 100% (certificate available). */
  readonly completed: boolean;
}

/**
 * A learning path (ruta) — an ordered curated set of courses toward a goal
 * (e.g. "Ruta Full-Stack"). Rendered as a custom section of SH-4.
 */
export interface LearningPath {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Course ids that make up the path (order = sequence). */
  readonly courseIds: readonly string[];
  /** Percent of the path completed (0–100). */
  readonly percent: number;
}

/** `GET /api/academy/learning?student=` response — the student's dashboard. */
export interface LearningResult {
  readonly enrollments: readonly EnrolledCourse[];
  readonly paths: readonly LearningPath[];
}

// ─── Classroom Q&A (polymorphic with Blogs comments) ─────────────────────────

/**
 * A lesson Q&A entry. Mirrors the comments engine that already operates on any
 * node — here the "node" is the lesson. Kept local so the module builds offline;
 * the real wiring mounts `<synergos-comments-widget>` against the lesson nodeKey.
 */
export interface LessonQuestion {
  readonly id: string;
  readonly author: string;
  readonly question: string;
  readonly answer?: string;
  readonly date: string;
}

// ─── Assignment submission ───────────────────────────────────────────────────

/** State of the student's assignment submission for a lesson. */
export type SubmissionStatus = 'none' | 'submitted' | 'graded';

/** A local, optimistic assignment submission record. */
export interface AssignmentSubmission {
  readonly lessonId: string;
  readonly fileName: string;
  readonly status: SubmissionStatus;
  readonly grade?: string;
  readonly feedback?: string;
}

// ─── Certificate (SH-10 credential wallet) ───────────────────────────────────

/** The certificate issued when progress reaches 100%. */
export interface Certificate {
  readonly id: string;
  readonly studentName: string;
  readonly courseTitle: string;
  readonly issuedAt: string;
  readonly verifyUrl: string;
  /** Human credential (hours, level) for the wallet detail rows. */
  readonly credentialLine?: string;
}

// ─── Instructor cara (SH-5 console + SH-6 authoring) ─────────────────────────

/** One course row in the instructor console (SH-5 courses table). */
export interface InstructorCourse {
  readonly id: string;
  readonly title: string;
  readonly status: CourseStatus;
  readonly price: number;
  readonly currency: string;
  readonly studentCount: number;
  /** Aggregate rating (0–5). */
  readonly rating: number;
  /** Revenue attributed to this course, major units. */
  readonly revenue: number;
  readonly publishedAt: string;
}

/** Course lifecycle state (drives the console status pill). */
export type CourseStatus = 'published' | 'draft' | 'review';

/** One enrolled-student row in the instructor console (SH-5 students table). */
export interface InstructorStudent {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly courseId: string;
  readonly courseTitle: string;
  /** Percent complete (0–100). */
  readonly percent: number;
  readonly enrolledAt: string;
}

/** One inbound question in the instructor Q&A dashboard (SH-5 qa queue). */
export interface InstructorQuestion {
  readonly id: string;
  readonly studentName: string;
  readonly courseTitle: string;
  readonly lessonTitle: string;
  readonly question: string;
  /** `true` once answered (drives the "pendiente/respondida" pill). */
  readonly answered: boolean;
  readonly createdAt: string;
}

/**
 * `GET /api/academy/instructor/courses?instructor=` response — the instructor's
 * operational view (cursos + alumnos + Q&A) for the SH-5 console.
 */
export interface InstructorDeskResult {
  readonly courses: readonly InstructorCourse[];
  readonly students: readonly InstructorStudent[];
  readonly questions: readonly InstructorQuestion[];
  /** Aggregate metrics for the performance KPIs. */
  readonly totalStudents: number;
  readonly totalRevenue: number;
  /** Aggregate rating across all courses (0–5). */
  readonly averageRating: number;
}

/** `POST /api/academy/course` request body (the SH-6 wizard's published draft). */
export interface CreateCourseRequest {
  readonly title: string;
  readonly subtitle: string;
  readonly category: string;
  readonly level: CourseLevel;
  readonly price: number;
  /** Curriculum module titles authored in the builder (one lesson per module seed). */
  readonly modules: readonly string[];
}

/** `POST /api/academy/course` response — the created course's id + status. */
export interface CreateCourseResult {
  readonly id: string;
  readonly status: CourseStatus;
}
