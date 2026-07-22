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
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
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
  type LearningPath,
  type LessonQuestion,
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
  readonly studentName = signal('');
  readonly studentEmail = signal('');
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  // Enrolment result
  readonly enrollmentId = signal('');
  readonly enrolledCourseId = signal('');

  // Classroom / player (gated)
  readonly activeLessonId = signal('');
  readonly completedLessonIds = signal<readonly string[]>([]);
  readonly progressPercent = signal(0);
  readonly classroomTab = signal<ClassroomTab>('overview');
  readonly questions = signal<readonly LessonQuestion[]>([]);
  readonly questionDraft = signal('');
  readonly submissions = signal<Readonly<Record<string, AssignmentSubmission>>>({});

  // Mi aprendizaje (SH-4 account)
  readonly enrollments = signal<readonly EnrolledCourse[]>([]);
  readonly paths = signal<readonly LearningPath[]>([]);
  readonly learningLoaded = signal(false);
  readonly accountSection = signal<'courses' | 'paths'>('courses');

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
  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mi aprendizaje',
    navLabel: 'Secciones de mi aprendizaje',
    inboxEmptyMessage: 'Todavía no te has inscrito a ningún curso.',
    inboxLoadingMessage: 'Cargando tus cursos…',
    detailPlaceholder: 'Selecciona un curso para ver tu progreso y continuar.',
    sections: [
      { id: 'courses', label: 'Mis cursos', kind: 'inbox', badge: this.enrollments().length || undefined },
      { id: 'paths', label: 'Rutas de aprendizaje', kind: 'custom', badge: this.paths().length || undefined },
    ],
  }));

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
  readonly noActions: readonly ConsoleRowAction[] = [];

  readonly filteredStudents = computed<readonly InstructorStudent[]>(() => {
    const term = this.studentFilter().trim().toLowerCase();
    const list = this.desk()?.students ?? [];
    if (!term) {
      return list;
    }
    return list.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term) ||
        student.courseTitle.toLowerCase().includes(term),
    );
  });

  /** Union row type so the generic SH-5 console unifies `TRow` across sections. */
  readonly consoleRows = computed<
    readonly (InstructorCourse | InstructorStudent | InstructorQuestion)[]
  >(() => {
    switch (this.instructorView()) {
      case 'students':
        return this.filteredStudents();
      case 'qa':
        return this.desk()?.questions ?? [];
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
    void this.loadProgress(courseId, this.studentEmail().trim());
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

  private async loadProgress(courseId: string, student: string): Promise<void> {
    try {
      const progress = await this.#api.progress(this.apiBase(), courseId, student);
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

  /** Mark the active lesson complete — optimistic, then sync to the API. */
  markLessonComplete(): void {
    const lesson = this.activeLesson();
    if (!lesson || this.isLessonComplete(lesson.id)) {
      return;
    }
    void this.toggleLessonComplete(lesson, true);
  }

  toggleLessonCompleteFor(lesson: AcademyLesson): void {
    void this.toggleLessonComplete(lesson, !this.isLessonComplete(lesson.id));
  }

  private async toggleLessonComplete(lesson: AcademyLesson, complete: boolean): Promise<void> {
    const total = Math.max(1, this.orderedLessons().length);
    const before = this.completedLessonIds();
    const next = complete
      ? [...new Set([...before, lesson.id])]
      : before.filter((id) => id !== lesson.id);
    this.completedLessonIds.set(next);
    const optimisticPercent = Math.round((next.length / total) * 100);
    this.progressPercent.set(optimisticPercent);
    this.#api.updateEnrollmentProgress(this.enrolledCourseId(), optimisticPercent, next.length);

    const courseId = this.enrolledCourseId();
    const student = this.studentEmail().trim();
    try {
      const update = await this.#api.markComplete(
        this.apiBase(),
        courseId,
        lesson.id,
        student,
        optimisticPercent,
      );
      this.progressPercent.set(update.percent);
      this.#api.updateEnrollmentProgress(courseId, update.percent, next.length);
    } catch (error) {
      void error;
    }

    if (complete) {
      const payload = { courseId, lessonId: lesson.id, percent: this.progressPercent() };
      this.lessoncompleted.emit(payload);
      this.#bus.publish('lessoncompleted', payload);
    }
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
      void this.toggleLessonComplete(lesson, true);
    }
  }

  // ─── Mi aprendizaje (SH-4 account) ────────────────────────────────────────────
  private loadLearning(): void {
    if (this.learningLoaded()) {
      return;
    }
    const student = this.studentEmail().trim() || 'invitado@synergos.academy';
    void this.#api.learning(this.apiBase(), student, this.currency()).then((result) => {
      this.enrollments.set(result.enrollments);
      this.paths.set(result.paths);
      this.learningLoaded.set(true);
    });
  }

  reloadLearning(): void {
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
    const studentName = this.studentName().trim() || 'Estudiante Synergos';
    const courseTitle = this.detail()?.course.title ?? 'Curso Synergos';
    const cert = await this.#api.certificate(
      this.apiBase(),
      courseId,
      this.studentEmail().trim(),
      studentName,
      courseTitle,
    );
    this.certificate.set(cert);
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
    event: ConsoleRowActionEvent<InstructorCourse | InstructorStudent | InstructorQuestion>,
  ): void {
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
        this.createResultId.set(result.id);
        this.publishing.set(false);
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

  courseStatusLabel(status: InstructorCourse['status']): string {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'review':
        return 'En revisión';
      default:
        return 'Publicado';
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
