/**
 * Domain model for the Educación vertical's <c>&lt;synergos-academy&gt;</c> — a real
 * LMS app (catálogo · curso/PDP · inscripción/checkout · aula/player · certificado),
 * Udemy/Coursera-style.
 *
 * The academy speaks the LMS's course/module/lesson/progress language on the
 * catalogue + classroom side, but funnels enrolment into the engine's
 * vertical-agnostic <c>SessionItem[]</c> cart behind a single <c>Pricing</c>, then
 * one checkout — exactly the storefront's <c>seleccionar → pagar → confirmar</c>.
 * Here a cart line is the chosen course+plan and "confirmed" means **matrícula
 * activa** (the classroom unlocks). Free courses skip payment (enroll directo).
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The flow id the engine routes on — one strategy owns it. */
export const ACADEMY_FLOW = 'academy';

/** Every academy cart line is a `course` kind for the engine. */
export const ACADEMY_KIND: SessionItemKind = 'course';

/** The high-level phase / route the academy is in. */
export type AcademyView =
  | 'catalog' // search + filters listing
  | 'course' // course PDP (curriculum, instructor, plans)
  | 'checkout' // enrolment wizard (plan → datos → pago)
  | 'enrolled' // post-enrolment success bridge → classroom
  | 'classroom' // the aula / course player (gated)
  | 'certificate'; // printable certificate at 100%

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

/** `GET /api/academy/courses` response. */
export interface CatalogResult {
  readonly courses: readonly AcademyCourse[];
}

/** The active query the catalogue drives the search with. */
export interface CatalogCriteria {
  readonly q: string;
  readonly category: string;
  /** Empty string means "all levels". */
  readonly level: CourseLevel | '';
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

// ─── Certificate ─────────────────────────────────────────────────────────────

/** The certificate issued when progress reaches 100%. */
export interface Certificate {
  readonly id: string;
  readonly studentName: string;
  readonly courseTitle: string;
  readonly issuedAt: string;
  readonly verifyUrl: string;
}
