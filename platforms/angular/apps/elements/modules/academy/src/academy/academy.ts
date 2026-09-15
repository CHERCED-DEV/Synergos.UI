import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HostIdentityService } from '@synergos/core';
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  ReviewPanelComponent,
  type ReviewBlockedReason,
  CompareSelection,
  CompareTableComponent,
  type CompareAttribute,
  type CompareCandidate,
  type CompareRejection,
  type CompareTableConfig,
  type ReviewCriterionPrompt,
  type ReviewDraft,
  type ReviewEntry,
  type ReviewPanelConfig,
  type ReviewSummary,
  ConfirmationShellComponent,
  type ConfirmationAction,
  type ConfirmationShellConfig,
  type ConfirmationStep,
  AuthoringWizardComponent,
  CheckoutWizardComponent,
  ConsoleShellComponent,
  CredentialWalletComponent,
  DetailShellComponent,
  DiscoveryShellComponent,
  TrackingTimelineComponent,
  type AccountShellConfig,
  type AuthoringWizardConfig,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  type CredentialWalletConfig,
  type DetailMedia,
  type DetailSpec,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type DiscoverySortOption,
  type TrackingStage,
  type WalletCredential,
} from '@synergos/shells';
import {
  TabsComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  SynSkeletonComponent,
  SynErrorStateComponent,
} from '@synergos/shared';
import { AcademyApiClient } from './academy-api.client';
import type { EnrollSelectionPayload } from './academy-fulfillment.strategy';
import {
  ACADEMY_FLOW,
  type AcademyCourse,
  type AcademyLesson,
  type AcademyPlan,
  type AcademyRole,
  type AcademySortKey,
  type AcademyStudent,
  type AcademyView,
  type AssignmentSubmission,
  type CatalogCriteria,
  type Certificate,
  type CourseDetail,
  type CourseLevel,
  type EnrollStep,
  type EnrolledCourse,
  type InstructorCourse,
  type InstructorDeskResult,
  type InstructorQuestion,
  type InstructorStudent,
  type InstructorView,
  type ModerationDecision,
  type ModerationItem,
  type LearningPath,
  type LearningResult,
  type LessonQuestion,
  type ProgressUpdate,
} from './academy.model';

/**
 * Runtime config for the CMS element <c>elementSynAcademy</c>.
 *
 * Educación **v2** — the LMS portal (Udemy + Coursera + Platzi, doc 21 §2.4 +
 * `deep-research/educacion.md`) rebuilt as a **role-switch, hash-routed multi-page
 * SPA** and the Ola-5 consumer of the reusable shell catalogue `@synergos/shells`:
 *
 *  - **ALUMNO (público):** SH-1 `syn-discovery-shell` catálogo (facetas escuela ·
 *    nivel · precio) → SH-2 `syn-detail-shell` PDD (currículum acordeón · instructor
 *    · planes) → SH-3 `syn-checkout-wizard` inscripción (cursos gratis = enroll
 *    directo) → **AULA gated** (`<synergos-video-player>` + currículum con progreso +
 *    Q&A `<synergos-comments-widget>` + recursos + tareas + quiz) → SH-4
 *    `syn-account-shell` "mi aprendizaje" (cursos · progreso · rutas) → SH-10
 *    `syn-credential-wallet` certificado verificable.
 *  - **INSTRUCTOR (role-switch):** SH-5 `syn-console-shell` (mis cursos · alumnos ·
 *    Q&A dashboard · performance/ingresos) + SH-6 `syn-authoring-wizard` crear curso
 *    (datos → currículum builder → precio → publicar).
 *
 * 100% composable: no business is hardcoded; every knob comes from CMS props
 * (`apiBase`/`currency`/`config` JSON) and the data always comes from the API with
 * visible mock degradation. The shells stay domain-free (contrato D3) — the module
 * only feeds data, templates and its `AcademyFulfillmentStrategy`.
 */
export interface AcademyRuntimeConfig {
  /** Base URL of the academy API. Default `/api/academy`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `academy`. */
  readonly scope?: string;
  /** Initial cara. Default `student`. */
  readonly role?: AcademyRole;
  /** Catalogue hero heading. Default `Aprende de verdad, a tu ritmo`. */
  readonly heading?: string;
  /**
   * Catalogue hero subheading. Default
   * `Cursos con proyectos reales, mentoría y certificado verificable.`
   */
  readonly subheading?: string;
}

/** Typed event map for the transaction bus (academy ↔ checkout ↔ classroom ↔ IA). */
interface AcademyBus extends Record<string, unknown> {
  readonly enrolled: { readonly courseId: string; readonly enrollmentId: string };
  readonly lessoncompleted: {
    readonly courseId: string;
    readonly lessonId: string;
    readonly percent: number;
  };
  readonly certified: { readonly courseId: string; readonly certificateId: string };
}

const DEFAULT_API_BASE = '/api/academy';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'academy';
const DEFAULT_ROLE: AcademyRole = 'student';
const DEFAULT_HEADING = 'Aprende de verdad, a tu ritmo';
const DEFAULT_SUBHEADING = 'Cursos con proyectos reales, mentoría y certificado verificable.';
const SESSION_TTL_MS = 30 * 60 * 1000;

const ROLES: readonly { key: AcademyRole; label: string }[] = [
  { key: 'student', label: 'Aprender' },
  { key: 'instructor', label: 'Soy instructor' },
];

const SORT_OPTIONS: readonly DiscoverySortOption[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'rating', label: 'Mejor valorados' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
];

const LEVEL_LABELS: Readonly<Record<CourseLevel, string>> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

const CLEAN_CRITERIA: DiscoveryCriteria = { term: '', facets: {}, sort: 'relevance', page: 1 };

/** The instructor sections addressable inside the SH-5 console (order = sidebar). */
const INSTRUCTOR_SECTIONS: readonly InstructorView[] = [
  'courses',
  'students',
  'qa',
  'moderation',
  'performance',
];

type ClassroomTab = 'overview' | 'resources' | 'qa' | 'assignment';

function sanitizeConfig(value: Partial<AcademyRuntimeConfig>): AcademyRuntimeConfig {
  return omitUndefinedProperties<AcademyRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
    role: coerceRole(value.role),
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
  });
}

function coerceRole(value: unknown): AcademyRole | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'student' || raw === 'instructor' ? raw : undefined;
}

let academyInstanceId = 0;

@Component({
  selector: 'sg-academy',
  standalone: true,
  imports: [
    DiscoveryShellComponent,
    DetailShellComponent,
    CheckoutWizardComponent,
    AccountShellComponent,
    ConfirmationShellComponent,
    ReviewPanelComponent,
    CompareTableComponent,
    TrackingTimelineComponent,
    CredentialWalletComponent,
    ConsoleShellComponent,
    AuthoringWizardComponent,
    TabsComponent,
    NgTemplateOutlet,
    SynSkeletonComponent,
    SynErrorStateComponent,
  ],
  templateUrl: './academy.html',
  styleUrl: './academy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-video-player>, <synergos-comments-widget>…).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-academy' },
})
export class AcademyElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<AcademyBus>>(TransactionEventBusService);
  readonly #api = inject(AcademyApiClient);
  readonly #identity = inject(HostIdentityService);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<AcademyRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AcademyRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.currencyInput()), this.config()?.currency, DEFAULT_CURRENCY),
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), this.config()?.scope, DEFAULT_SCOPE),
  );
  readonly initialRole = computed<AcademyRole>(() =>
    resolveConfigValue(coerceRole(this.roleInput()), this.config()?.role, DEFAULT_ROLE),
  );
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      DEFAULT_HEADING,
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      DEFAULT_SUBHEADING,
    ),
  );

  readonly instanceId = (academyInstanceId += 1);
  readonly fieldId = `syn-academy-${this.instanceId}`;
  readonly roles = ROLES;
  readonly sortOptions = SORT_OPTIONS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly enrolled = output<{ courseId: string; enrollmentId: string }>();
  readonly lessoncompleted = output<{ courseId: string; lessonId: string; percent: number }>();
  readonly certified = output<{ courseId: string; certificateId: string }>();

  // ─── Role / shell state ──────────────────────────────────────────────────────
  readonly role = signal<AcademyRole>(DEFAULT_ROLE);

  /**
   * Si esta persona puede ver la consola del instructor, **según el host**.
   *
   * El backend ya lo gatea (`InstructorRolesCsv = "instructor,admin"`), así que
   * hasta ahora la app lo descubría fallando: pedía el panel y traducía el 403.
   * Con los roles del bridge se sabe antes, y el botón «Soy instructor» deja de
   * ofrecer una puerta que no se puede abrir (#17).
   *
   * - `'ok'`      — tiene el rol, o no hay host (standalone / demo / tests), que
   *                 es el camino por el que un elemento se monta fuera del CMS y
   *                 no se negocia: sin bridge, todo se comporta como antes.
   * - `'anon'`    — hay host y no hay sesión → ofrecer entrar.
   * - `'forbidden'` — hay sesión sin el rol → **entrar de nuevo NO ayuda**, y
   *                 decir «inicie sesión» ahí manda a la persona a dar vueltas.
   *
   * Autorizar sigue siendo del backend: esto decide qué se OFRECE, no qué se
   * puede. Un 403 suyo sigue siendo la última palabra.
   */
  readonly instructorAccess = computed<'ok' | 'anon' | 'forbidden'>(() => {
    if (!this.#identity.isAuthenticated()) {
      // Sin miembro no se puede distinguir «no hay host» de «no hay sesión»
      // mirando sólo el miembro: lo decide el bridge entero.
      return this.#identity.hasHost() ? 'anon' : 'ok';
    }
    return this.#identity.hasAnyRole('instructor', 'admin') ? 'ok' : 'forbidden';
  });
  // ─── Matrícula confirmada (SH-11) ───────────────────────────────────────────
  readonly enrolledConfig = computed<ConfirmationShellConfig>(() => ({
    heading: '¡Ya estás inscrito!',
    summary: 'Tu matrícula está activa y el curso te espera.',
    referenceLabel: 'Número de inscripción',
    stepsLabel: 'Qué sigue',
    copyLabel: 'Copiar número',
    copiedLabel: 'Número copiado',
  }));

  readonly enrolledSteps: readonly ConfirmationStep[] = [
    { id: 'matricula', label: 'Matrícula activa', done: true },
    { id: 'aula', label: 'Entra al aula', detail: 'Puedes empezar ahora mismo.' },
    { id: 'certificado', label: 'Al 100% recibes tu certificado', detail: 'Verificable por QR.' },
  ];

  readonly enrolledActions: readonly ConfirmationAction[] = [
    { id: 'aula', label: 'Ir al aula', kind: 'primary' },
    { id: 'aprendizaje', label: 'Mi aprendizaje' },
  ];

  onEnrolledAction(id: string): void {
    if (id === 'aula') {
      this.enterClassroom();
      return;
    }
    this.goToLearning();
  }

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  #suppressedHash = '';

  // ─── ALUMNO state ────────────────────────────────────────────────────────────
  readonly view = signal<AcademyView>('catalog');

  // Catalogue (SH-1 discovery)
  readonly criteria = signal<DiscoveryCriteria>(CLEAN_CRITERIA);
  readonly courses = signal<readonly AcademyCourse[]>([]);
  readonly facets = signal<readonly DiscoveryFacet[]>([]);
  readonly total = signal(0);
  readonly searched = signal(false);

  // Course PDD (SH-2 detail)
  readonly detail = signal<CourseDetail | null>(null);
  readonly expandedSections = signal<Readonly<Record<string, boolean>>>({});

  // Enrolment checkout (SH-3 wizard)
  readonly selectedPlanId = signal('');
  // Prellenados desde el host: con sesión, el CMS ya dijo quién es (#17).
  readonly studentName = signal(this.#identity.displayName());
  readonly studentEmail = signal(this.#identity.email());
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  // Enrolment result
  readonly enrollmentId = signal('');
  readonly enrolledCourseId = signal('');

  // Classroom / player (gated)
  readonly activeLessonId = signal('');
  readonly completedLessonIds = signal<readonly string[]>([]);
  readonly progressPercent = signal(0);
  /** Lo que el aula tiene que decir cuando una marca NO llegó al servidor (#116). */
  readonly progressNotice = signal('');
  readonly classroomTab = signal<ClassroomTab>('overview');
  readonly questions = signal<readonly LessonQuestion[]>([]);
  readonly questionDraft = signal('');
  readonly submissions = signal<Readonly<Record<string, AssignmentSubmission>>>({});

  // Mi aprendizaje (SH-4 account)
  //
  // El expediente entero vive en UNA señal con su estado, no en dos listas: «no
  // tienes cursos», «no pudimos leerlo» y «no has iniciado sesión» son tres
  // pantallas distintas y con dos listas vacías las tres se ven igual (regla 15).
  // `null` = todavía no se ha pedido.
  readonly learning = signal<LearningResult | null>(null);
  readonly learningLoaded = signal(false);
  readonly accountSection = signal<'courses' | 'paths'>('courses');

  /** Las matrículas LEÍDAS. Vacío aquí significa vacío sólo cuando `status` es `ok`. */
  readonly enrollments = computed<readonly EnrolledCourse[]>(() => {
    const result = this.learning();
    return result?.status === 'ok' ? result.enrollments : [];
  });

  readonly paths = computed<readonly LearningPath[]>(() => {
    const result = this.learning();
    return result?.status === 'ok' ? result.paths : [];
  });

  /** `anon` pide sesión; `unreadable` lo dice; `ok` pinta el expediente. */
  readonly learningState = computed<'loading' | 'ok' | 'anon' | 'unreadable'>(
    () => this.learning()?.status ?? 'loading',
  );

  // Certificate (SH-10 wallet)
  readonly certificate = signal<Certificate | null>(null);

  // ─── INSTRUCTOR state ────────────────────────────────────────────────────────
  readonly instructorView = signal<InstructorView>('courses');
  readonly desk = signal<InstructorDeskResult | null>(null);
  readonly deskLoaded = signal(false);
  readonly studentFilter = signal('');
  readonly publishing = signal(false);
  readonly createResultId = signal('');
  readonly createDraft = signal<Readonly<Record<string, unknown>>>({});

  // ─── Engine-derived state ────────────────────────────────────────────────────
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    void this.searched();
    void this.view();
    void this.detail();
    void this.desk();
    void this.enrollments();
    void this.progressPercent();
    void this.certificate();
    return this.#api.degraded;
  });

  // ─── Catalogue derived (SH-1) ─────────────────────────────────────────────────
  readonly hasActiveFilters = computed(() => {
    const active = this.criteria();
    return active.term.trim() !== '' || Object.values(active.facets).some((v) => v.length > 0);
  });

  // ─── PDD derived (SH-2) ───────────────────────────────────────────────────────
  readonly selectedPlan = computed<AcademyPlan | null>(() => {
    const detail = this.detail();
    if (!detail) {
      return null;
    }
    const id = this.selectedPlanId();
    return (
      detail.plans.find((plan) => plan.id === id) ??
      detail.plans.find((plan) => plan.featured) ??
      detail.plans[0] ??
      null
    );
  });

  readonly isFreeCourse = computed(() => (this.detail()?.course.amount ?? 0) <= 0);

  readonly totalLessons = computed(() =>
    (this.detail()?.sections ?? []).reduce((sum, section) => sum + section.lessons.length, 0),
  );

  readonly pdpMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.detail();
    if (!detail || !detail.course.cover) {
      return [];
    }
    return [{ url: detail.course.cover, alt: detail.course.title }];
  });

  readonly pdpSpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.detail();
    if (!detail) {
      return [];
    }
    const course = detail.course;
    return [
      { label: 'Nivel', value: this.levelLabel(course.level) },
      { label: 'Escuela', value: course.category || '—' },
      { label: 'Lecciones', value: String(this.totalLessons() || course.lessonCount) },
      { label: 'Duración', value: this.durationLabel(course.durationMinutes) || '—' },
      { label: 'Valoración', value: course.rating > 0 ? course.rating.toFixed(1) : '—' },
      { label: 'Estudiantes', value: this.formatCount(course.studentCount) },
    ];
  });

  readonly pdpPriceLabel = computed(() => {
    const detail = this.detail();
    if (!detail) {
      return '';
    }
    if (this.isFreeCourse()) {
      return 'Gratis';
    }
    const plan = this.selectedPlan();
    const amount = plan ? plan.amount : detail.course.amount;
    return this.formatPrice(amount, detail.course.currency || this.currency());
  });

  // ─── Classroom derived ────────────────────────────────────────────────────────
  readonly activeLesson = computed<AcademyLesson | null>(() => {
    const id = this.activeLessonId();
    for (const section of this.detail()?.sections ?? []) {
      const found = section.lessons.find((lesson) => lesson.id === id);
      if (found) {
        return found;
      }
    }
    return null;
  });

  /** Flat, ordered lesson list — drives prev/next navigation. */
  readonly orderedLessons = computed<readonly AcademyLesson[]>(() =>
    (this.detail()?.sections ?? []).flatMap((section) => section.lessons),
  );

  readonly activeLessonIndex = computed(() =>
    this.orderedLessons().findIndex((lesson) => lesson.id === this.activeLessonId()),
  );

  readonly hasPrevLesson = computed(() => this.activeLessonIndex() > 0);
  readonly hasNextLesson = computed(
    () => this.activeLessonIndex() >= 0 && this.activeLessonIndex() < this.orderedLessons().length - 1,
  );

  readonly isCourseComplete = computed(() => this.progressPercent() >= 100);

  readonly activeSubmission = computed<AssignmentSubmission | null>(() => {
    const lessonId = this.activeLessonId();
    return this.submissions()[lessonId] ?? null;
  });

  /** Q&A node key for `<synergos-comments-widget>` — the lesson IS the node. */
  readonly qaNodeKey = computed(() => `academy:${this.enrolledCourseId()}:${this.activeLessonId()}`);

  /**
   * Classroom content-tab descriptors fed to the shared `syn-tabs` primitive. We
   * consume it as the accessible tablist only (roving tabindex + Arrow/Home/End +
   * focus come for free); the rich `@switch` panels stay in this module's template,
   * so `content` is intentionally empty and the primitive's own text panel is hidden
   * in the SCSS. "Tarea" only appears when the active lesson allows an assignment.
   */
  readonly classroomTabs = computed<
    readonly { readonly id: ClassroomTab; readonly label: string; readonly content: string }[]
  >(() => {
    const tabs = [
      { id: 'overview' as const, label: 'Resumen', content: '' },
      { id: 'resources' as const, label: 'Recursos', content: '' },
      { id: 'qa' as const, label: 'Q&A', content: '' },
    ];
    return this.activeLesson()?.allowAssignment
      ? [...tabs, { id: 'assignment' as const, label: 'Tarea', content: '' }]
      : tabs;
  });

  // ─── Validity ──────────────────────────────────────────────────────────────
  readonly studentNameValid = computed(() => this.studentName().trim().length >= 2);
  readonly studentEmailValid = computed(() => /.+@.+\..+/.test(this.studentEmail().trim()));
  readonly studentValid = computed(() => this.studentNameValid() && this.studentEmailValid());

  // ─── Enrolment checkout (SH-3 wizard) ─────────────────────────────────────────
  readonly enrollSteps = computed<CheckoutWizardConfig>(() => ({
    steps: [
      { id: 'plan', label: 'Plan' },
      { id: 'student', label: 'Tus datos' },
      { id: 'review', label: 'Confirmar' },
    ],
    stepsLabel: 'Pasos para inscribirte',
    summaryHeading: 'Tu inscripción',
    submitLabel: 'Pagar e inscribirme',
    processingLabel: 'Procesando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
    totalLabel: 'Total',
  }));

  /** Per-step gating for the SH-3 enrolment wizard. */
  readonly enrollValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    plan: this.selectedPlan() !== null,
    student: this.studentValid(),
    review: this.selectedPlan() !== null && this.studentValid(),
  }));

  /** PSP instrument handed to the strategy's `pay`. */
  readonly enrollInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    apiBase: this.apiBase(),
    provider: this.isFreeCourse()
      ? 'academy-free'
      : this.paymentMethod() === 'pse'
        ? 'academy-pse'
        : 'academy-card',
    student: { name: this.studentName().trim(), email: this.studentEmail().trim() },
  }));

  // ─── Mi aprendizaje (SH-4 account) ────────────────────────────────────────────
  readonly accountConfig = computed<AccountShellConfig>(() => {
    const unreadable = this.learningState() === 'unreadable';
    return {
      heading: 'Mi aprendizaje',
      navLabel: 'Secciones de mi aprendizaje',
      // El vacío HONESTO, que antes era inalcanzable: sin matrículas se caía al
      // mock y el alumno nuevo veía tres cursos que no compró.
      inboxEmptyTitle: 'Todavía no te has inscrito a ningún curso',
      inboxEmptyMessage: 'Cuando te matricules, tus cursos y tu avance aparecerán aquí.',
      inboxEmptyActionLabel: 'Explorar el catálogo',
      inboxLoadingMessage: 'Cargando tus cursos…',
      detailPlaceholder: 'Selecciona un curso para ver tu progreso y continuar.',
      // Y el ILEGIBLE, que no se puede ver igual: una lista vacía aquí diría «no
      // tienes matrículas» cuando la verdad es «no pudimos leer tu expediente».
      errorTitle: unreadable ? 'No pudimos leer tu aprendizaje' : undefined,
      errorMessage: unreadable
        ? 'Que esto esté vacío no quiere decir que no tengas cursos: no pudimos leer tu expediente.'
        : undefined,
      sections: [
        { id: 'courses', label: 'Mis cursos', kind: 'inbox', badge: this.enrollments().length || undefined },
        // La sección de rutas sólo existe si hay rutas. El borde las devuelve
        // SIEMPRE vacías a propósito —no hay seam del que sacarlas— y pintar
        // «todavía no sigues ninguna ruta» convierte «esto no existe» en «no has
        // empezado». Es la lista vacía que afirma, de la regla 15.
        ...(this.paths().length > 0
          ? [{ id: 'paths', label: 'Rutas de aprendizaje', kind: 'custom' as const, badge: this.paths().length }]
          : []),
      ],
    };
  });

  readonly trackingByRef = signal<Readonly<Record<string, readonly TrackingStage[]>>>({});

  // ─── Certificate (SH-10 wallet) ───────────────────────────────────────────────
  readonly walletConfig: CredentialWalletConfig = {
    heading: 'Mi certificado',
    emptyMessage: 'Completa el curso al 100% para obtener tu certificado verificable.',
    listLabel: 'Mis credenciales',
    referenceLabel: 'Código de verificación',
    expandLabel: 'Ver credencial y QR',
    collapseLabel: 'Ocultar credencial',
    qrSize: 160,
  };

  readonly walletCredentials = computed<readonly WalletCredential[]>(() => {
    const cert = this.certificate();
    if (!cert) {
      return [];
    }
    return [
      {
        id: cert.id,
        kind: 'Certificado',
        title: cert.courseTitle,
        subtitle: `Otorgado a ${cert.studentName}`,
        reference: cert.id,
        status: { label: 'Verificable', tone: 'positive' },
        issuedAt: this.formatDate(cert.issuedAt),
        qrData: cert.verifyUrl,
        fields: [
          { label: 'Estudiante', value: cert.studentName },
          { label: 'Curso', value: cert.courseTitle },
          { label: 'Emitido', value: this.formatDate(cert.issuedAt) },
          { label: 'Credencial', value: cert.credentialLine || 'Synergos Academy' },
          { label: 'Verificar en', value: cert.verifyUrl },
        ],
      },
    ];
  });

  // ─── Instructor console (SH-5) ────────────────────────────────────────────────
  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Consola del instructor',
    navLabel: 'Secciones del instructor',
    kpisLabel: 'Indicadores del portafolio',
    filtersLabel: 'Filtros',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay filas en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      { id: 'courses', label: 'Mis cursos', kind: 'table', badge: this.desk()?.courses.length || undefined },
      { id: 'students', label: 'Alumnos', kind: 'table', badge: this.desk()?.students.length || undefined },
      { id: 'qa', label: 'Q&A', kind: 'table', badge: this.pendingQuestions() || undefined },
      {
        id: 'moderation',
        label: 'Opiniones',
        kind: 'table',
        badge: this.moderationQueue().length || undefined,
      },
      { id: 'performance', label: 'Performance', kind: 'custom' },
    ],
  }));

  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() => {
    const desk = this.desk();
    if (!desk) {
      return [];
    }
    const published = desk.courses.filter((course) => course.status === 'published').length;
    return [
      { id: 'courses', label: 'Cursos publicados', value: this.formatCount(published), hint: `${desk.courses.length} en total` },
      { id: 'students', label: 'Alumnos', value: this.formatCount(desk.totalStudents), trend: 'up', delta: '+8%' },
      { id: 'revenue', label: 'Ingresos', value: this.formatPrice(desk.totalRevenue, this.currency()) },
      { id: 'rating', label: 'Valoración media', value: desk.averageRating > 0 ? desk.averageRating.toFixed(2) : '—' },
    ];
  });

  readonly pendingQuestions = computed(
    () => this.desk()?.questions.filter((question) => !question.answered).length ?? 0,
  );

  readonly courseColumns: readonly ConsoleColumn[] = [
    { key: 'title', label: 'Curso' },
    { key: 'status', label: 'Estado' },
    { key: 'price', label: 'Precio', align: 'end' },
    { key: 'students', label: 'Alumnos', align: 'end' },
    { key: 'rating', label: 'Valoración', align: 'end' },
    { key: 'revenue', label: 'Ingresos', align: 'end' },
  ];

  readonly studentColumns: readonly ConsoleColumn[] = [
    { key: 'name', label: 'Alumno' },
    { key: 'course', label: 'Curso' },
    { key: 'progress', label: 'Progreso', align: 'end' },
    { key: 'enrolledAt', label: 'Inscrito' },
  ];

  readonly questionColumns: readonly ConsoleColumn[] = [
    { key: 'student', label: 'Alumno' },
    { key: 'course', label: 'Curso · lección' },
    { key: 'question', label: 'Pregunta' },
    { key: 'status', label: 'Estado' },
  ];

  readonly courseActions: readonly ConsoleRowAction[] = [
    { id: 'preview', label: 'Ver', kind: 'default' },
    { id: 'edit', label: 'Editar', kind: 'primary' },
  ];
  readonly questionActions: readonly ConsoleRowAction[] = [
    { id: 'answer', label: 'Responder', kind: 'primary' },
  ];
  readonly moderationColumns: readonly ConsoleColumn[] = [
    { key: 'moderationReason', label: 'Motivo' },
    { key: 'moderationAuthor', label: 'Quién y dónde' },
    { key: 'moderationBody', label: 'Qué dice' },
  ];
  // `reject` es `danger` y no `default`: quita algo que alguien escribió, y un
  // botón neutro al lado de «Aprobar» invita a pulsarlo sin mirar.
  readonly moderationActions: readonly ConsoleRowAction[] = [
    { id: 'approve', label: 'Aprobar', kind: 'primary' },
    { id: 'reject', label: 'Rechazar', kind: 'danger' },
  ];
  readonly noActions: readonly ConsoleRowAction[] = [];

  readonly filteredStudents = computed<readonly InstructorStudent[]>(() => {
    const term = this.studentFilter().trim().toLowerCase();
    const list = this.desk()?.students ?? [];
    if (!term) {
      return list;
    }
    // Sin correo: el borde ya no lo emite (CMS#107), así que filtrar por él sólo
    // podía dejar de encontrar a gente.
    return list.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.courseTitle.toLowerCase().includes(term),
    );
  });

  /** Union row type so the generic SH-5 console unifies `TRow` across sections. */
  /**
   * La cola de moderación, con **las reportadas primero** (#31).
   *
   * No es preferencia estética: una reportada YA está publicada y haciendo daño,
   * mientras que una pendiente todavía no la ve nadie. Atenderlas en el orden en
   * que llegaron dejaría lo urgente debajo de lo que puede esperar.
   */
  readonly moderationQueue = computed<readonly ModerationItem[]>(() => {
    const items = this.desk()?.moderation ?? [];
    return [...items].sort((a, b) => {
      if (a.reason !== b.reason) {
        return a.reason === 'reported' ? -1 : 1;
      }
      // Dentro del mismo motivo, primero la que más gente reportó.
      return b.reportCount - a.reportCount;
    });
  });

  readonly consoleRows = computed<
    readonly (InstructorCourse | InstructorStudent | InstructorQuestion | ModerationItem)[]
  >(() => {
    switch (this.instructorView()) {
      case 'students':
        return this.filteredStudents();
      case 'qa':
        return this.desk()?.questions ?? [];
      case 'moderation':
        return this.moderationQueue();
      default:
        return this.desk()?.courses ?? [];
    }
  });

  readonly consoleColumns = computed<readonly ConsoleColumn[]>(() => {
    switch (this.instructorView()) {
      case 'students':
        return this.studentColumns;
      case 'qa':
        return this.questionColumns;
      case 'moderation':
        return this.moderationColumns;
      default:
        return this.courseColumns;
    }
  });

  readonly consoleActions = computed<readonly ConsoleRowAction[]>(() => {
    switch (this.instructorView()) {
      case 'courses':
        return this.courseActions;
      case 'qa':
        return this.questionActions;
      case 'moderation':
        return this.moderationActions;
      default:
        return this.noActions;
    }
  });

  // ─── Crear curso (SH-6 authoring) ─────────────────────────────────────────────
  readonly createConfig: AuthoringWizardConfig = {
    heading: 'Crear curso',
    steps: [
      { id: 'datos', label: 'Datos' },
      { id: 'curriculum', label: 'Currículum' },
      { id: 'precio', label: 'Precio' },
      { id: 'publicar', label: 'Publicar' },
    ],
    stepsLabel: 'Pasos para crear el curso',
    backLabel: 'Atrás',
    nextLabel: 'Continuar',
    publishLabel: 'Publicar curso',
    publishingLabel: 'Publicando…',
    draftScope: `academy-create.${this.instanceId}`,
  };

  readonly createValidity = computed<Readonly<Record<string, boolean>>>(() => {
    const draft = this.createDraft();
    const title = this.draftString(draft, 'title');
    const category = this.draftString(draft, 'category');
    const modules = this.draftString(draft, 'modules');
    const price = this.draftString(draft, 'price');
    return {
      datos: title.trim().length >= 3 && category.trim().length >= 2,
      curriculum: modules.trim().length >= 2,
      precio: Number(price) >= 0,
      publicar: true,
    };
  });

  constructor() {
    this.role.set(this.initialRole());

    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `academy.${this.instanceId}`,
      flow: ACADEMY_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
    });
    this.#bus.scope(`academy-${this.instanceId}`);

    const widget = this.#orchestrator.register('academy-catalog', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/curso/<id>, #/<scope>/instructor…).
    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });

    if (this.role() === 'instructor') {
      void this.loadDesk().then(() => this.applyHash());
    } else {
      void this.runSearch().then(() => this.applyHash());
    }
  }

  // ─── Role switch ─────────────────────────────────────────────────────────────
  /**
   * Imágenes cuya carga FALLÓ. El `@if (…avatar)` de la plantilla sólo caía a las
   * iniciales cuando la URL venía VACÍA — nunca cuando daba 404, que es el caso real:
   * `/media/academy/instructors/sofia.webp` no existe en disco y la ficha mostraba el
   * icono de imagen rota del navegador con la rama de iniciales ahí al lado, escrita y
   * sin poder alcanzarse. Un fallback que sólo cubre "no hay URL" no cubre "la URL miente".
   */
  readonly #imgFailed = signal<ReadonlySet<string>>(new Set());

  onImageError(key: string): void {
    this.#imgFailed.update((s) => new Set(s).add(key));
  }

  /** true si hay URL y además cargó. */
  hasImage(url: string | null | undefined, key: string): boolean {
    return !!url && !this.#imgFailed().has(key);
  }

  setRole(role: AcademyRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    this.errorMessage.set('');
    if (role === 'instructor') {
      if (!this.desk()) {
        void this.loadDesk();
      }
      this.writeHash('instructor', this.instructorView());
    } else {
      if (this.courses().length === 0) {
        void this.runSearch();
      }
      this.navigate('catalog');
    }
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  private eventValue(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement | null)?.value ?? '';
  }

  // ─── Router (signals + hash deep-links) ──────────────────────────────────────
  navigate(view: AcademyView, param = ''): void {
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  goToCatalog(): void {
    this.detail.set(null);
    this.navigate('catalog');
  }

  goToLearning(): void {
    this.accountSection.set('courses');
    this.navigate('learning');
  }

  private applyRoute(view: AcademyView, param: string): void {
    this.errorMessage.set('');
    switch (view) {
      case 'course':
        if (param && param !== this.detail()?.course.id) {
          void this.loadCourse(param);
        } else {
          this.view.set('course');
        }
        return;
      case 'classroom':
        if (!this.enrollmentId()) {
          this.view.set(this.detail() ? 'course' : 'catalog');
          return;
        }
        this.view.set('classroom');
        return;
      case 'certificate':
        if (!this.isCourseComplete() && !this.certificate()) {
          this.view.set(this.enrollmentId() ? 'classroom' : 'catalog');
          return;
        }
        this.view.set('certificate');
        return;
      case 'learning':
        this.view.set('learning');
        this.loadLearning();
        return;
      case 'enrolled':
        if (!this.enrollmentId()) {
          this.view.set('catalog');
          return;
        }
        this.view.set('enrolled');
        return;
      default:
        this.view.set(view);
    }
  }

  private routeHash(view: AcademyView, param: string): string {
    const base = `#/${this.scope()}`;
    switch (view) {
      case 'catalog':
        return base;
      case 'course':
        return `${base}/curso/${encodeURIComponent(param)}`;
      case 'checkout':
        return `${base}/inscripcion`;
      case 'enrolled':
        return `${base}/matriculado`;
      case 'classroom':
        return `${base}/aula`;
      case 'learning':
        return `${base}/mi-aprendizaje`;
      case 'certificate':
        return `${base}/certificado`;
      default:
        return base;
    }
  }

  private writeHash(view: AcademyView | 'instructor', param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const base = `#/${this.scope()}`;
    const hash =
      view === 'instructor'
        ? `${base}/instructor${param ? `/${param}` : ''}`
        : this.routeHash(view as AcademyView, param);
    if (window.location.hash !== hash) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (hash === this.#suppressedHash) {
      this.#suppressedHash = '';
      return;
    }
    const base = `#/${this.scope()}`;
    if (hash !== base && !hash.startsWith(`${base}/`)) {
      return;
    }
    const segments = hash.slice(base.length).split('/').filter((s) => s !== '');
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.role.set('student');
        this.applyRoute('catalog', '');
        return;
      case 'curso':
        this.role.set('student');
        this.applyRoute('course', decodeURIComponent(tail));
        return;
      case 'aula':
        this.role.set('student');
        this.applyRoute('classroom', '');
        return;
      case 'mi-aprendizaje':
        this.role.set('student');
        this.applyRoute('learning', '');
        return;
      case 'certificado':
        this.role.set('student');
        this.applyRoute('certificate', '');
        return;
      case 'instructor':
        this.role.set('instructor');
        if ((INSTRUCTOR_SECTIONS as readonly string[]).includes(tail)) {
          this.instructorView.set(tail as InstructorView);
        }
        if (!this.desk()) {
          void this.loadDesk();
        }
        return;
      default:
        this.applyRoute('catalog', '');
    }
  }

  // ─── Catalogue (SH-1 wiring) ──────────────────────────────────────────────────
  onCriteriaChange(criteria: DiscoveryCriteria): void {
    this.criteria.set(criteria);
    void this.runSearch();
  }

  #searchPending = false;

  private async runSearch(): Promise<void> {
    if (this.loading()) {
      this.#searchPending = true;
      return;
    }
    const active = this.criteria();
    const facetPick = (key: string): string => (active.facets[key] ?? [])[0] ?? '';
    const criteria: CatalogCriteria = {
      q: active.term.trim(),
      category: facetPick('category'),
      level: (facetPick('level') as CourseLevel | '') || '',
      price: facetPick('price'),
      sort: (active.sort as AcademySortKey) || 'relevance',
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.view.set('catalog');
    const requestId = `courses:${JSON.stringify(criteria)}`;
    try {
      const result = await this.#orchestrator.callApi(requestId, () =>
        this.#api.courses(this.apiBase(), criteria, this.currency()),
      );
      this.courses.set(result.courses);
      this.facets.set(result.facets);
      this.total.set(result.total);
      this.searched.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los cursos. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
      if (this.#searchPending) {
        this.#searchPending = false;
        void this.runSearch();
      }
    }
  }

  // ─── Course PDD (SH-2 wiring) ─────────────────────────────────────────────────
  openCourse(course: AcademyCourse): void {
    this.navigate('course', course.id);
  }

  /** Último id de curso solicitado, para reintentar desde el error-state. */
  #pendingCourseId = '';

  /** Reintenta cargar el curso tras un error (lo invoca el (retry) de syn-error-state). */
  retryCourse(): void {
    if (this.#pendingCourseId) {
      void this.loadCourse(this.#pendingCourseId);
    }
  }

  private async loadCourse(id: string): Promise<void> {
    this.#pendingCourseId = id;
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`course:${id}`, () =>
        this.#api.course(this.apiBase(), id, this.currency()),
      );
      this.detail.set(detail);
      const featured = detail.plans.find((plan) => plan.featured) ?? detail.plans[0] ?? null;
      this.selectedPlanId.set(featured?.id ?? '');
      const first = detail.sections[0];
      this.expandedSections.set(first ? { [first.id]: true } : {});
      this.view.set('course');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el curso. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  toggleSection(sectionId: string): void {
    const current = this.expandedSections();
    this.expandedSections.set({ ...current, [sectionId]: !current[sectionId] });
  }

  isSectionExpanded(sectionId: string): boolean {
    return !!this.expandedSections()[sectionId];
  }

  selectPlan(plan: AcademyPlan): void {
    this.selectedPlanId.set(plan.id);
  }

  planPriceLabel(plan: AcademyPlan): string {
    return plan.amount <= 0 ? 'Gratis' : this.formatPrice(plan.amount, this.currency());
  }

  // ─── Enrolment (SH-3 wizard over engine) ──────────────────────────────────────
  /** CTA on the PDD. Free → enroll directo; paid → checkout wizard. */
  startEnrollment(): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }
    this.errorMessage.set('');
    if (this.isFreeCourse()) {
      void this.enrollFree(detail);
      return;
    }
    void this.selectIntoCart(detail.course, this.selectedPlan());
    this.navigate('checkout');
  }

  private async enrollFree(detail: CourseDetail): Promise<void> {
    const plan = this.selectedPlan() ?? detail.plans[0] ?? null;
    await this.selectIntoCart(detail.course, plan);
    this.studentName.set(this.studentName() || 'Estudiante invitado');
    this.studentEmail.set(this.studentEmail() || 'estudiante@synergos.academy');
    void this.placeEnrollment();
  }

  private async selectIntoCart(course: AcademyCourse, plan: AcademyPlan | null): Promise<void> {
    const session = this.#store.getValidSession();
    const payload: EnrollSelectionPayload = {
      courseId: course.id,
      courseTitle: course.title,
      planId: plan?.id ?? '',
      planLabel: plan?.label ?? 'Acceso',
      amount: plan ? plan.amount : course.amount,
      currency: course.currency || this.currency(),
      cover: course.cover,
    };
    const selection = await this.#fulfillment.select(
      {
        productRef: course.id,
        kind: 'course',
        label: course.title,
        amount: payload.amount,
        selection: payload as unknown as Readonly<Record<string, unknown>>,
      },
      session,
    );
    // Single-line cart: replace any prior selection with this enrolment.
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.reprice();
  }

  /** SH-3 step-change: keep native form model in sync (payment method radio lives here). */
  onEnrollStepChange(stepId: string): void {
    void (stepId as EnrollStep);
  }

  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }

  onEnrollExit(): void {
    this.navigate('course', this.detail()?.course.id ?? '');
  }

  /** SH-3 wizard completed a pay+confirm round → matrícula activa. */
  onEnrollCompleted(result: CheckoutWizardResult): void {
    const voucher = result.vouchers[0];
    const detail = voucher?.detail ?? {};
    const enrollmentId =
      (typeof detail['enrollmentId'] === 'string' ? detail['enrollmentId'] : '') || result.reference;
    const courseId = this.detail()?.course.id ?? this.#store.items()[0]?.productRef ?? '';
    this.finishEnrollment(courseId, enrollmentId);
  }

  onEnrollFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos completar la inscripción. Intenta de nuevo.');
  }

  /** Free path: run pay+confirm directly (no wizard). */
  private async placeEnrollment(): Promise<void> {
    if (this.loading() || !this.#store.hasItems()) {
      return;
    }
    const student: AcademyStudent = {
      name: this.studentName().trim(),
      email: this.studentEmail().trim(),
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.#store.setStatus('paying');
    try {
      const session = this.#store.getValidSession();
      const payResult = await this.#fulfillment.pay({
        session,
        instrument: { apiBase: this.apiBase(), student },
      });
      if (!payResult.accepted || !payResult.reference) {
        throw new Error('payment-rejected');
      }
      const paid = {
        ...this.#store.getValidSession(),
        payments: [
          {
            id: `pay-${Date.now().toString(36)}`,
            amount: this.#store.pricing().totalAmount,
            provider: 'academy-free',
            status: 'captured' as const,
            reference: payResult.reference,
          },
        ],
        status: 'paying' as const,
      };
      this.#store.setSession(paid);
      const confirmation = await this.#fulfillment.confirm(this.#store.getValidSession());
      if (!confirmation.confirmed) {
        throw new Error('not-confirmed');
      }
      const voucher = confirmation.vouchers[0];
      const enrollmentId = voucher?.reference ?? payResult.reference;
      const courseId = this.detail()?.course.id ?? this.#store.items()[0]?.productRef ?? '';
      this.loading.set(false);
      this.finishEnrollment(courseId, enrollmentId);
    } catch (error) {
      this.loading.set(false);
      this.errorMessage.set('No pudimos completar la inscripción. Intenta de nuevo.');
      this.#store.setStatus('building');
      void error;
    }
  }

  /** Shared post-confirm bridge (free + wizard paths). */
  private finishEnrollment(courseId: string, enrollmentId: string): void {
    this.enrollmentId.set(enrollmentId);
    this.enrolledCourseId.set(courseId);
    this.#store.setStatus('confirmed');
    this.view.set('enrolled');
    this.writeHash('enrolled', '');
    const payload = { courseId, enrollmentId };
    this.enrolled.emit(payload);
    this.#bus.publish('enrolled', payload);
    // Seed "mi aprendizaje" and prime classroom state.
    this.recordEnrollment(courseId, enrollmentId);
    void this.loadProgress(courseId);
  }

  private recordEnrollment(courseId: string, enrollmentId: string): void {
    const detail = this.detail();
    if (!detail || detail.course.id !== courseId) {
      return;
    }
    const lessonCount = this.totalLessons() || detail.course.lessonCount;
    const entry: EnrolledCourse = {
      enrollmentId,
      course: detail.course,
      percent: 0,
      lessonCount,
      completedCount: 0,
      lastActivityAt: new Date().toISOString().slice(0, 10),
      completed: false,
    };
    this.#api.recordEnrollment(entry);
    this.learningLoaded.set(false);
  }

  // ─── Classroom (gated to enrolled) ────────────────────────────────────────────
  enterClassroom(): void {
    if (!this.enrollmentId()) {
      return;
    }
    const first = this.orderedLessons()[0] ?? null;
    if (first && !this.activeLessonId()) {
      this.activeLessonId.set(first.id);
    }
    this.classroomTab.set('overview');
    this.questions.set(seedQuestions());
    this.navigate('classroom');
  }

  private async loadProgress(courseId: string): Promise<void> {
    try {
      const progress = await this.#api.progress(this.apiBase(), courseId);
      this.completedLessonIds.set(progress.completedLessonIds);
      this.progressPercent.set(progress.percent);
    } catch (error) {
      this.completedLessonIds.set([]);
      this.progressPercent.set(0);
      void error;
    }
  }

  selectLesson(lesson: AcademyLesson): void {
    this.activeLessonId.set(lesson.id);
    this.classroomTab.set('overview');
    this.questions.set(seedQuestions());
  }

  previousLesson(): void {
    const index = this.activeLessonIndex();
    if (index > 0) {
      this.selectLesson(this.orderedLessons()[index - 1]);
    }
  }

  nextLesson(): void {
    const index = this.activeLessonIndex();
    const lessons = this.orderedLessons();
    if (index >= 0 && index < lessons.length - 1) {
      this.selectLesson(lessons[index + 1]);
    }
  }

  isLessonComplete(lessonId: string): boolean {
    return this.completedLessonIds().includes(lessonId);
  }

  setClassroomTab(tab: ClassroomTab): void {
    this.classroomTab.set(tab);
  }

  /** Mark the active lesson complete — optimistic paint, then the server's word. */
  markLessonComplete(): void {
    const lesson = this.activeLesson();
    if (!lesson || this.isLessonComplete(lesson.id)) {
      return;
    }
    void this.markLesson(lesson);
  }

  /**
   * **Desmarcar no existe en el contrato**, y por eso no se finge.
   *
   * `POST /api/academy/progress` sólo sabe MARCAR (`MarkLessonAsync`): no hay
   * operación inversa. Quitar la palomita en local dejaba la casilla vacía sobre un
   * expediente donde la lección seguía completa, o sea la misma mentira que este
   * ticket vino a quitar, con el signo cambiado. Se dice que no se puede.
   */
  toggleLessonCompleteFor(lesson: AcademyLesson): void {
    if (this.isLessonComplete(lesson.id)) {
      this.progressNotice.set('Una lección que ya completaste no se puede desmarcar.');
      return;
    }
    void this.markLesson(lesson);
  }

  /**
   * Marca una lección. **Lo optimista se PINTA; lo que se guarda lo dice el
   * servidor** (regla 18 del `CLAUDE.md`).
   *
   * La casilla y la barra responden al instante —esperar a la red para pintar una
   * palomita es peor producto y no es más honesto—, pero el número que queda es el
   * que devuelve el borde, y si el POST no llega **se vuelve al estado anterior** y
   * se dice. Antes el cliente contestaba el porcentaje que este método acababa de
   * calcular, así que «guardado» y «no salió» se veían exactamente igual: el alumno
   * veía avanzar la barra, cerraba, volvía, y su avance no estaba.
   *
   * Y no se emite `lessoncompleted` sobre algo que no se guardó: ese evento sale al
   * bus y lo leen otros elementos de la página.
   */
  private async markLesson(lesson: AcademyLesson): Promise<void> {
    const total = Math.max(1, this.orderedLessons().length);
    const before = this.completedLessonIds();
    const beforePercent = this.progressPercent();
    const next = [...new Set([...before, lesson.id])];
    const courseId = this.enrolledCourseId();

    this.progressNotice.set('');
    this.completedLessonIds.set(next);
    const optimisticPercent = Math.round((next.length / total) * 100);
    this.progressPercent.set(optimisticPercent);
    this.#api.updateEnrollmentProgress(courseId, optimisticPercent, next.length);

    let update: ProgressUpdate;
    try {
      update = await this.#api.markComplete(this.apiBase(), courseId, lesson.id);
    } catch {
      // Nada quedó guardado: la casilla vuelve a donde estaba —no a un tercer estado
      // que sería otra afirmación— y el mensaje dice qué hacer.
      this.completedLessonIds.set(before);
      this.progressPercent.set(beforePercent);
      this.#api.updateEnrollmentProgress(courseId, beforePercent, before.length);
      this.progressNotice.set(
        'No pudimos guardar que completaste esta lección. Vuelve a marcarla en un momento.',
      );
      return;
    }

    this.progressPercent.set(update.percent);
    this.#api.updateEnrollmentProgress(courseId, update.percent, next.length);

    const payload = { courseId, lessonId: lesson.id, percent: update.percent };
    this.lessoncompleted.emit(payload);
    this.#bus.publish('lessoncompleted', payload);
    this.learningLoaded.set(false);
  }

  // ─── Q&A (polymorphic with Blogs comments) ────────────────────────────────────
  postQuestion(): void {
    const text = this.questionDraft().trim();
    if (text.length < 3) {
      return;
    }
    const entry: LessonQuestion = {
      id: `q-${Date.now().toString(36)}`,
      author: this.studentName().trim() || 'Estudiante',
      question: text,
      date: new Date().toISOString().slice(0, 10),
    };
    this.questions.update((list) => [entry, ...list]);
    this.questionDraft.set('');
  }

  // ─── Assignment submission ────────────────────────────────────────────────────
  onAssignmentFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    const lesson = this.activeLesson();
    if (!file || !lesson) {
      return;
    }
    const submission: AssignmentSubmission = {
      lessonId: lesson.id,
      fileName: file.name,
      status: 'submitted',
    };
    this.submissions.update((map) => ({ ...map, [lesson.id]: submission }));
    if (!this.isLessonComplete(lesson.id)) {
      void this.markLesson(lesson);
    }
  }

  // ─── Mi aprendizaje (SH-4 account) ────────────────────────────────────────────
  /**
   * **Sin `?student=`.** El borde toma al alumno de la sesión; mandarle un correo
   * era, además de inútil, el TECLEADO en el checkout mientras el aula escribe el
   * progreso con el del gate — dos expedientes para la misma persona.
   */
  private loadLearning(): void {
    if (this.learningLoaded()) {
      return;
    }
    void this.#api.learning(this.apiBase(), this.currency()).then((result) => {
      this.learning.set(result);
      this.learningLoaded.set(true);
    });
  }

  reloadLearning(): void {
    // A `null` y no a la lista vieja: mientras se relee, la pantalla dice «cargando»
    // y no «no tienes cursos».
    this.learning.set(null);
    this.learningLoaded.set(false);
    this.loadLearning();
  }

  onAccountSectionChange(sectionId: string): void {
    if (sectionId === 'courses' || sectionId === 'paths') {
      this.accountSection.set(sectionId);
    }
  }

  onEnrollmentSelect(enrollment: EnrolledCourse): void {
    if (this.trackingByRef()[enrollment.course.id]) {
      return;
    }
    const stages: TrackingStage[] = [
      { id: 'enrolled', label: 'Matrícula activa', state: 'done' },
      {
        id: 'progress',
        label: `Avance ${enrollment.percent}%`,
        state: enrollment.percent > 0 ? 'done' : 'pending',
      },
      {
        id: 'completed',
        label: 'Curso completado',
        state: enrollment.completed ? 'done' : 'pending',
      },
      {
        id: 'certificate',
        label: 'Certificado emitido',
        state: enrollment.completed ? 'current' : 'pending',
      },
    ];
    this.trackingByRef.update((map) => ({ ...map, [enrollment.course.id]: stages }));
  }

  trackingStages(courseId: string): readonly TrackingStage[] {
    return this.trackingByRef()[courseId] ?? [];
  }

  /** Resume an enrolled course from "mi aprendizaje" → open its aula. */
  continueLearning(enrollment: EnrolledCourse): void {
    this.enrollmentId.set(enrollment.enrollmentId);
    this.enrolledCourseId.set(enrollment.course.id);
    this.progressPercent.set(enrollment.percent);
    void this.loadCourse(enrollment.course.id).then(() => this.enterClassroom());
  }

  coursesOfPath(path: LearningPath): readonly AcademyCourse[] {
    const known = new Map<string, AcademyCourse>();
    for (const course of this.courses()) {
      known.set(course.id, course);
    }
    for (const enrollment of this.enrollments()) {
      known.set(enrollment.course.id, enrollment.course);
    }
    return path.courseIds
      .map((id) => known.get(id))
      .filter((course): course is AcademyCourse => course !== undefined);
  }

  // ─── Certificate (SH-10 wallet) ───────────────────────────────────────────────
  viewCertificate(): void {
    if (!this.isCourseComplete()) {
      return;
    }
    if (!this.certificate()) {
      void this.loadCertificate();
    }
    this.navigate('certificate');
  }

  private async loadCertificate(): Promise<void> {
    const courseId = this.enrolledCourseId();
    const cert = await this.#api.certificate(this.apiBase(), courseId);
    this.certificate.set(cert);
    if (!cert) {
      // Sin credencial no se anuncia una: `certified` es lo que el host escucha para
      // dar el curso por acreditado.
      this.errorMessage.set(
        'Tu certificado aún no está disponible. Vuelve a intentarlo en un momento.',
      );
      return;
    }
    this.errorMessage.set('');
    const payload = { courseId, certificateId: cert.id };
    this.certified.emit(payload);
    this.#bus.publish('certified', payload);
  }

  backToClassroom(): void {
    this.navigate('classroom');
  }

  printCertificate(): void {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  // ─── INSTRUCTOR console (SH-5) ────────────────────────────────────────────────
  onInstructorSectionChange(sectionId: string): void {
    if ((INSTRUCTOR_SECTIONS as readonly string[]).includes(sectionId)) {
      this.instructorView.set(sectionId as InstructorView);
      this.writeHash('instructor', sectionId);
    }
  }

  private async loadDesk(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#orchestrator.callApi('instructor-desk', () =>
        this.#api.instructorDesk(this.apiBase(), 'instructor'),
      );
      this.desk.set(result);
      this.deskLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar la consola del instructor. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  reloadDesk(): void {
    this.deskLoaded.set(false);
    void this.loadDesk();
  }

  setStudentFilter(event: Event): void {
    this.studentFilter.set(this.eventValue(event));
  }

  onConsoleAction(
    event: ConsoleRowActionEvent<
      InstructorCourse | InstructorStudent | InstructorQuestion | ModerationItem
    >,
  ): void {
    if (event.sectionId === 'moderation') {
      void this.decideModeration(
        (event.row as ModerationItem).id,
        event.actionId === 'reject' ? 'reject' : 'approve',
      );
      return;
    }
    if (event.sectionId === 'courses') {
      const row = event.row as InstructorCourse;
      if (event.actionId === 'preview') {
        this.setRole('student');
        this.navigate('course', row.id);
        return;
      }
      if (event.actionId === 'edit') {
        this.openCreate();
        this.createDraft.update((draft) => ({ ...draft, title: row.title }));
      }
      return;
    }
    if (event.sectionId === 'qa' && event.actionId === 'answer') {
      const row = event.row as InstructorQuestion;
      this.desk.update((desk) =>
        desk
          ? {
              ...desk,
              questions: desk.questions.map((question) =>
                question.id === row.id ? { ...question, answered: true } : question,
              ),
            }
          : desk,
      );
    }
  }

  // ─── La cola de moderación (#31) ─────────────────────────────────────────────
  readonly moderationDecidingId = signal<string | null>(null);
  readonly moderationNotice = signal('');
  readonly moderationFailed = signal(false);

  /**
   * Aprueba o rechaza una opinión en cola.
   *
   * **La fila se quita de la cola sólo cuando el servidor contesta**, no al
   * pulsar: quitarla antes y que el POST falle dejaría la opinión publicada con
   * el docente creyendo que la atendió — la regla 4 de `CLAUDE.md` sobre la
   * escritura que más consecuencias tiene.
   */
  async decideModeration(reviewId: string, decision: ModerationDecision): Promise<void> {
    if (this.moderationDecidingId() !== null) {
      return;
    }
    this.moderationDecidingId.set(reviewId);
    this.moderationFailed.set(false);
    this.moderationNotice.set('');

    const result = await this.#api.decideModeration(this.apiBase(), reviewId, decision);
    this.moderationDecidingId.set(null);

    // `already-decided` sale de la cola igual: otra persona la atendió, y dejarla
    // ahí haría pulsar sobre algo resuelto.
    if (result.ok || result.reason === 'already-decided') {
      this.desk.update((desk) =>
        desk
          ? { ...desk, moderation: desk.moderation.filter((item) => item.id !== reviewId) }
          : desk,
      );
      this.moderationNotice.set(
        result.ok
          ? decision === 'approve'
            ? 'Opinión aprobada. Ya se ve en el curso.'
            : 'Opinión rechazada. No se publicará.'
          : 'Otra persona ya la había atendido.',
      );
      return;
    }

    this.moderationFailed.set(true);
    this.moderationNotice.set(
      result.reason === 'forbidden'
        ? 'No puedes moderar las opiniones de este curso.'
        : 'No pudimos guardar la decisión. La opinión sigue como estaba.',
    );
  }

  moderationReasonLabel(item: ModerationItem): string {
    return item.reason === 'reported'
      ? `Reportada ${item.reportCount === 1 ? '1 vez' : `${this.formatCount(item.reportCount)} veces`}`
      : 'Sin publicar';
  }

  openCreate(): void {
    this.instructorView.set('create');
    this.createResultId.set('');
    this.writeHash('instructor', 'create');
  }

  // ─── Crear curso (SH-6 authoring wizard) ──────────────────────────────────────
  onCreateDraftChange(draft: Readonly<Record<string, unknown>>): void {
    this.createDraft.set(draft);
  }

  onCreateExit(): void {
    this.instructorView.set('courses');
    this.writeHash('instructor', 'courses');
  }

  onCreatePublished(draft: Readonly<Record<string, unknown>>): void {
    const modules = this.draftString(draft, 'modules')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const request = {
      title: this.draftString(draft, 'title'),
      subtitle: this.draftString(draft, 'subtitle'),
      category: this.draftString(draft, 'category'),
      level: (this.draftString(draft, 'level') as CourseLevel) || 'beginner',
      price: Number(this.draftString(draft, 'price')) || 0,
      modules,
    };
    this.publishing.set(true);
    void this.#api
      .createCourse(this.apiBase(), request, this.currency())
      .then((result) => {
        this.publishing.set(false);
        if (!result.persisted) {
          // El borrador sigue en el wizard: quien lo escribió no pierde el trabajo, y
          // sobre todo no se va con un id de curso que no existe.
          this.errorMessage.set(
            'No pudimos publicar el curso: el servidor no lo confirmó. Tu borrador sigue acá.',
          );
          return;
        }
        this.errorMessage.set('');
        this.createResultId.set(result.id);
        this.deskLoaded.set(false);
        void this.loadDesk();
      })
      .catch(() => this.publishing.set(false));
  }

  private draftString(draft: Readonly<Record<string, unknown>>, key: string): string {
    const value = draft[key];
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  }

  draftPatchHandler(
    patch: (values: Readonly<Record<string, unknown>>) => void,
    field: string,
  ): (event: Event) => void {
    return (event: Event) =>
      patch({ [field]: (event.target as HTMLInputElement | null)?.value ?? '' });
  }

  // ─── Start over ────────────────────────────────────────────────────────────────
  startOver(): void {
    this.#store.reset();
    this.detail.set(null);
    this.enrollmentId.set('');
    this.enrolledCourseId.set('');
    this.completedLessonIds.set([]);
    this.progressPercent.set(0);
    this.certificate.set(null);
    this.activeLessonId.set('');
    this.submissions.set({});
    this.questions.set([]);
    this.errorMessage.set('');
    this.navigate('catalog');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  /** Recompute aggregate pricing from the single enrolment line. */
  private reprice(): void {
    const items = this.#store.items();
    const total = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: items.map((item) => ({
        code: `line:${item.id}`,
        label: item.label,
        amount: item.amount * item.quantity,
      })),
    });
  }

  coursePriceLabel(course: AcademyCourse): string {
    if (course.amount <= 0) {
      return 'Gratis';
    }
    return this.formatPrice(course.amount, course.currency || this.currency());
  }

  courseListPriceLabel(course: AcademyCourse): string {
    return course.listAmount
      ? this.formatPrice(course.listAmount, course.currency || this.currency())
      : '';
  }

  levelLabel(level: CourseLevel): string {
    return LEVEL_LABELS[level] ?? level;
  }

  // ─── Reportar una reseña (#31) ───────────────────────────────────────────────
  readonly reportedReviewIds = signal<readonly string[]>([]);
  readonly reportingReviewId = signal<string | null>(null);

  /** Sin sesión no se reporta: un reporte anónimo no se atiende ni se deduplica. */
  readonly canReportReview = computed(() => this.#identity.isAuthenticated());

  async reportReview(reviewId: string): Promise<void> {
    if (this.reportingReviewId() !== null || this.reportedReviewIds().includes(reviewId)) {
      return;
    }
    this.reportingReviewId.set(reviewId);
    this.reviewFailed.set(false);

    const result = await this.#api.reportCourseReview(this.apiBase(), reviewId);
    this.reportingReviewId.set(null);

    // `already-reported` es éxito: el servidor deduplica y decirle «falló» a quien
    // avisó lo haría reintentar algo que ya está hecho.
    if (result.ok || result.reason === 'already-reported') {
      this.reportedReviewIds.update((ids) => [...ids, reviewId]);
      this.reviewNotice.set('Gracias por avisar. Vamos a revisarla.');
      return;
    }

    this.reviewFailed.set(true);
    this.reviewNotice.set(
      result.reason === 'unauthenticated'
        ? 'Inicia sesión para reportar una opinión.'
        : 'No pudimos registrar el reporte. Intenta de nuevo.',
    );
  }

  // ─── SH-14 Comparar (#30) ────────────────────────────────────────────────────
  //
  // En formación el eje es el COMPROMISO: cuántas horas, cuántas lecciones, qué
  // nivel, si certifica. El precio importa menos que el tiempo, y es justo lo que
  // un catálogo de tarjetas no deja contrastar.
  readonly compare = new CompareSelection<CompareCandidate>(4);
  readonly compareRejection = signal<CompareRejection | null>(null);

  readonly compareAttributes: readonly CompareAttribute[] = [
    { id: 'price', label: 'Precio', group: 'Lo que cuesta' },
    { id: 'listPrice', label: 'Antes', group: 'Lo que cuesta' },
    { id: 'duration', label: 'Duración', group: 'Lo que exige' },
    { id: 'lessons', label: 'Lecciones', group: 'Lo que exige' },
    { id: 'level', label: 'Nivel', group: 'Lo que exige' },
    { id: 'category', label: 'Categoría', group: 'Lo que es' },
    { id: 'instructor', label: 'Docente', group: 'Lo que es' },
    { id: 'rating', label: 'Calificación', group: 'Qué dicen' },
    { id: 'students', label: 'Estudiantes', group: 'Qué dicen' },
  ];

  readonly compareConfig: CompareTableConfig = {
    heading: 'Comparar cursos',
    nounPlural: 'cursos',
    needMoreMessage: 'Marca al menos dos cursos para ver lado a lado lo que te piden.',
  };

  readonly compareMessage = computed(() => {
    switch (this.compareRejection()) {
      case 'limit-reached':
        return `Puedes comparar hasta ${this.compare.limit} cursos. Quita uno para añadir otro.`;
      case 'already-added':
        return 'Ese curso ya está en la comparación.';
      default:
        return '';
    }
  });

  inCompare(id: string): boolean {
    return this.compare.has(id);
  }

  toggleCompare(course: AcademyCourse): void {
    this.compareRejection.set(this.compare.toggle(this.toCandidate(course)));
  }

  removeFromCompare(id: string): void {
    this.compare.remove(id);
    this.compareRejection.set(null);
  }

  clearCompare(): void {
    this.compare.clear();
    this.compareRejection.set(null);
  }

  openCompared(candidate: CompareCandidate): void {
    const course = this.courses().find((item) => item.id === candidate.id);
    if (course) {
      this.openCourse(course);
    }
  }

  /**
   * **Un curso sin estudiantes no lleva «0,0» de nota.** El `rating` de un curso
   * recién publicado vale 0 porque nadie lo calificó, y escribirlo en la tabla lo
   * pondría debajo de uno malo — afirmar una nota que nadie dio. Mismo criterio
   * que en la Tienda y que el `reviewCount` de SH-13 (#28).
   */
  private toCandidate(course: AcademyCourse): CompareCandidate {
    const values: Record<string, string> = {
      price: this.coursePriceLabel(course),
      listPrice: this.courseListPriceLabel(course),
      duration: this.durationLabel(course.durationMinutes),
      lessons: course.lessonCount > 0 ? this.formatCount(course.lessonCount) : '',
      level: this.levelLabel(course.level),
      category: course.category,
      instructor: course.instructorName,
      rating: course.studentCount > 0 ? course.rating.toFixed(1) : '',
      students: course.studentCount > 0 ? `${this.formatCount(course.studentCount)} alumnos` : '',
    };
    return {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      headline: this.coursePriceLabel(course),
      imageUrl: course.cover || undefined,
      values,
    };
  }

  /** `null` = no consta. «Publicado» era el `default`, o sea la ausencia afirmando. */
  courseStatusLabel(status: InstructorCourse['status']): string {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'review':
        return 'En revisión';
      case 'published':
        return 'Publicado';
      default:
        return 'Sin estado';
    }
  }

  durationLabel(minutes: number): string {
    if (minutes <= 0) {
      return '';
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins} min`;
    }
    return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
  }

  // ─── Opiniones del curso: SH-13 `syn-review-panel` (#28) ────────────────────
  //
  // Educación MOSTRABA nota y conteo y no los podía ganar: el número salía del
  // backend y nadie lo alimentaba. Lo propio del dominio son los CRITERIOS —un
  // curso se califica por claridad, utilidad y ritmo, no por limpieza— y el gate:
  // sólo opina quien cursó, y lo decide el servidor.
  readonly reviewPanel = viewChild(ReviewPanelComponent);
  readonly reviewSending = signal(false);
  readonly reviewNotice = signal('');
  readonly reviewFailed = signal(false);

  readonly courseReviews = computed<readonly ReviewEntry[]>(() =>
    (this.detail()?.reviews ?? []).map((review) => ({
      id: review.id,
      author: review.author,
      rating: review.rating,
      title: review.title,
      body: review.body,
      date: review.date,
      verified: review.verified,
      ...(review.reply ? { reply: review.reply } : {}),
    })),
  );

  readonly courseReviewSummary = computed<ReviewSummary>(() => {
    const resumen = this.detail()?.reviewSummary;
    if (!resumen) {
      return { average: 0, count: 0 };
    }
    return {
      average: resumen.average,
      count: resumen.count,
      distribution: resumen.distribution,
      criteria: resumen.criteria,
    };
  });

  readonly canReviewCourse = computed(() => this.detail()?.canReview === true);

  /**
   * Los criterios que se le piden a quien escribe. Salen de los que el servidor
   * ya promedió, así que la pantalla pregunta exactamente por lo que muestra: una
   * lista escrita a mano acá se desincronizaría del resumen al primer cambio.
   */
  readonly courseReviewPrompts = computed<readonly ReviewCriterionPrompt[]>(() =>
    (this.detail()?.reviewSummary?.criteria ?? []).map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
    })),
  );

  readonly courseReviewBlocked = computed<ReviewBlockedReason | null>(() => {
    if (this.canReviewCourse() || !this.detail()) {
      return null;
    }
    // Sin sesión, volver a entrar SÍ lo arregla. Con sesión, el problema es no
    // haber cursado y ofrecer login mandaría a dar vueltas (ADR 0112).
    //
    // `hasHost()` distingue los dos «sin sesión» que importan: sin bridge del CMS
    // no hay a dónde iniciar sesión, así que decir «inicia sesión» sería mandar a
    // un sitio que no existe (#17).
    if (!this.#identity.isAuthenticated() && this.#identity.hasHost()) {
      return 'unauthenticated';
    }
    // `not-consumer` y no `not-student`: la pieza no sabe qué es un estudiante, y
    // ponerlo en su vocabulario la inutilizaría para el siguiente dominio. El
    // rótulo concreto lo pone `blockedNotConsumer` en la config.
    return 'not-consumer';
  });

  readonly courseReviewConfig = computed<ReviewPanelConfig>(() => ({
    heading: 'Opiniones del curso',
    countLabel: 'opiniones',
    formTitle: 'Cuenta tu experiencia con el curso',
    submitLabel: 'Publicar opinión',
    verifiedLabel: 'Cursó este programa',
    blockedNotConsumer:
      'Solo quien está matriculado en este curso puede opinar. Inscríbete y cuéntanos después.',
    emptyMessage: 'Todavía no hay opiniones de este curso. Sé la primera persona en contarlo.',
  }));

  /**
   * Publica la opinión del curso. **No dice «gracias» si el servidor no aceptó**:
   * el endpoint todavía no existe, así que hoy esto falla a la vista — y eso es la
   * verdad, no un placeholder (regla 4 de `CLAUDE.md`).
   */
  async submitCourseReview(draft: ReviewDraft): Promise<void> {
    const course = this.detail()?.course;
    if (!course || this.reviewSending()) {
      return;
    }
    this.reviewSending.set(true);
    this.reviewNotice.set('');
    this.reviewFailed.set(false);

    const result = await this.#api.submitCourseReview(this.apiBase(), course.id, {
      rating: draft.rating,
      title: draft.title,
      body: draft.body,
      criteria: draft.criteria,
    });

    this.reviewSending.set(false);

    if (result.ok) {
      // Se limpia acá y no en la pieza: sólo este lado sabe que el servidor dijo sí.
      // Y en los DOS casos: encolada también es aceptada, y dejar el texto puesto
      // invita a mandarlo otra vez.
      this.reviewPanel()?.reset();

      if (result.pending) {
        // Ni «publicada» ni recarga (#31): recargar traería la lista SIN la reseña,
        // o sea la prueba de que el acuse miente, en la misma pantalla.
        this.reviewNotice.set(
          'Gracias. Tu opinión quedó en revisión del docente y se publicará cuando la apruebe.',
        );
        return;
      }

      this.reviewNotice.set('¡Gracias! Tu opinión ya está publicada.');
      await this.loadCourse(course.id);
      return;
    }

    this.reviewFailed.set(true);
    switch (result.reason) {
      case 'unauthenticated':
        this.reviewNotice.set('Inicia sesión para dejar tu opinión.');
        break;
      case 'not-student':
        // Sin oferta de login: la sesión no es el problema (ADR 0112).
        this.reviewNotice.set('Solo quien está matriculado en este curso puede opinar.');
        break;
      case 'invalid':
        this.reviewNotice.set('Revisa la calificación y el texto de tu opinión.');
        break;
      default:
        this.reviewNotice.set('No pudimos publicar tu opinión. Intenta de nuevo.');
    }
  }

  formatPrice(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
    }
  }

  formatDate(iso: string): string {
    if (!iso) {
      return '';
    }
    try {
      return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  /** es-CO grouped integer. */
  formatCount(value: number): string {
    try {
      return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
    } catch {
      return String(value);
    }
  }
}

/** Seed a couple of Q&A entries so the classroom tab is never empty in the demo. */
function seedQuestions(): readonly LessonQuestion[] {
  return [
    {
      id: 'seed-q1',
      author: 'María G.',
      question: '¿Esta lección tiene prerequisitos del módulo anterior?',
      answer: 'Sí, conviene haber visto la lección de fundamentos primero.',
      date: '2026-05-18',
    },
    {
      id: 'seed-q2',
      author: 'Julián P.',
      question: '¿Los recursos descargables se actualizan con el tiempo?',
      date: '2026-06-02',
    },
  ];
}
