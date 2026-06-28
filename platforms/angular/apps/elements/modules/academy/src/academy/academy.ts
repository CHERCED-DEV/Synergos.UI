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
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { AcademyApiClient, buildMockCertificate } from './academy-api.client';
import type { EnrollSelectionPayload } from './academy-fulfillment.strategy';
import {
  ACADEMY_FLOW,
  type AcademyCourse,
  type AcademyLesson,
  type AcademyPlan,
  type AcademySortKey,
  type AcademyStudent,
  type AssignmentSubmission,
  type CatalogCriteria,
  type Certificate,
  type CourseDetail,
  type CourseLevel,
  type EnrollStep,
  type LessonQuestion,
  type AcademyView,
} from './academy.model';

/**
 * Runtime config for the CMS element <c>elementSynAcademy</c>.
 *
 * The Educación vertical as a real LMS app (catálogo · curso · inscripción ·
 * aula/player · certificado), reusing the shared <c>@synergos/transaction-engine</c>
 * for the unified enrolment checkout and cross-island coordination, and the Blogs
 * comments engine (polymorphic) for lesson Q&A.
 */
export interface AcademyRuntimeConfig {
  /** Base URL of the academy API. Default `/api/academy`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `academy`. */
  readonly scope?: string;
}

/** Typed event map for the transaction bus (academy ↔ checkout ↔ classroom ↔ IA). */
interface AcademyBus extends Record<string, unknown> {
  readonly enrolled: { readonly courseId: string; readonly enrollmentId: string };
  readonly lessoncompleted: { readonly courseId: string; readonly lessonId: string; readonly percent: number };
  readonly certified: { readonly courseId: string; readonly certificateId: string };
}

const DEFAULT_API_BASE = '/api/academy';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'academy';
const SESSION_TTL_MS = 30 * 60 * 1000;

const SORT_OPTIONS: readonly { key: AcademySortKey; label: string }[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'rating', label: 'Mejor valorados' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
];

const LEVEL_OPTIONS: readonly { key: CourseLevel | ''; label: string }[] = [
  { key: '', label: 'Todos los niveles' },
  { key: 'beginner', label: 'Principiante' },
  { key: 'intermediate', label: 'Intermedio' },
  { key: 'advanced', label: 'Avanzado' },
];

function sanitizeConfig(value: Partial<AcademyRuntimeConfig>): AcademyRuntimeConfig {
  return omitUndefinedProperties<AcademyRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
  });
}

let academyInstanceId = 0;

@Component({
  selector: 'sg-academy',
  standalone: true,
  imports: [],
  templateUrl: './academy.html',
  styleUrl: './academy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars>, <synergos-comments-widget> …).
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

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.currencyInput()),
      this.config()?.currency,
      DEFAULT_CURRENCY,
    ),
  );
  readonly scope = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.scopeInput()),
      this.config()?.scope,
      DEFAULT_SCOPE,
    ),
  );

  readonly instanceId = (academyInstanceId += 1);
  readonly fieldId = `syn-academy-${this.instanceId}`;
  readonly sortOptions = SORT_OPTIONS;
  readonly levelOptions = LEVEL_OPTIONS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly enrolled = output<{ courseId: string; enrollmentId: string }>();
  readonly lessoncompleted = output<{ courseId: string; lessonId: string; percent: number }>();
  readonly certified = output<{ courseId: string; certificateId: string }>();

  // ─── UI state ───────────────────────────────────────────────────────────────
  readonly view = signal<AcademyView>('catalog');
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  // Catalogue
  readonly searchTerm = signal('');
  readonly activeCategory = signal('');
  readonly activeLevel = signal<CourseLevel | ''>('');
  readonly sort = signal<AcademySortKey>('relevance');
  readonly courses = signal<readonly AcademyCourse[]>([]);
  readonly searched = signal(false);

  // Course PDP
  readonly detail = signal<CourseDetail | null>(null);
  readonly expandedSections = signal<Readonly<Record<string, boolean>>>({});

  // Enrolment checkout wizard
  readonly enrollStep = signal<EnrollStep>('plan');
  readonly selectedPlanId = signal('');
  readonly studentName = signal('');
  readonly studentEmail = signal('');
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  // Enrolment result
  readonly enrollmentId = signal('');
  readonly enrolledCourseId = signal('');

  // Classroom / player
  readonly activeLessonId = signal('');
  readonly completedLessonIds = signal<readonly string[]>([]);
  readonly progressPercent = signal(0);
  readonly classroomTab = signal<'overview' | 'resources' | 'qa' | 'assignment'>('overview');
  readonly questions = signal<readonly LessonQuestion[]>([]);
  readonly questionDraft = signal('');
  readonly submissions = signal<Readonly<Record<string, AssignmentSubmission>>>({});

  // Certificate
  readonly certificate = signal<Certificate | null>(null);

  // ─── Engine-derived state ────────────────────────────────────────────────────
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    // Recompute on each view/search/detail change; the flag is set by the API client.
    void this.searched();
    void this.view();
    void this.detail();
    void this.progressPercent();
    return this.#api.degraded;
  });

  // ─── Catalogue derived ───────────────────────────────────────────────────────
  readonly categories = computed(() => {
    const set = new Set<string>();
    for (const course of this.courses()) {
      if (course.category) {
        set.add(course.category);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es-CO'));
  });

  readonly hasActiveFilters = computed(
    () => !!this.activeCategory() || !!this.activeLevel() || !!this.searchTerm().trim(),
  );

  // ─── PDP derived ─────────────────────────────────────────────────────────────
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

  // ─── Classroom derived ───────────────────────────────────────────────────────
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

  // ─── Validity ────────────────────────────────────────────────────────────────
  readonly studentNameValid = computed(() => this.studentName().trim().length >= 2);
  readonly studentEmailValid = computed(() => /.+@.+\..+/.test(this.studentEmail().trim()));
  readonly studentValid = computed(() => this.studentNameValid() && this.studentEmailValid());

  constructor() {
    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `academy.${this.instanceId}`,
      flow: ACADEMY_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
    });
    this.#bus.scope(`academy-${this.instanceId}`);

    // Register the catalogue widget so the orchestrator tracks page readiness.
    const widget = this.#orchestrator.register('academy-catalog', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
    });

    // Open the academy with an initial unfiltered catalogue.
    void this.runSearch();
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Catalogue ───────────────────────────────────────────────────────────────
  submitSearch(): void {
    void this.runSearch();
  }

  setSort(value: string): void {
    const next = SORT_OPTIONS.find((option) => option.key === value)?.key ?? 'relevance';
    this.sort.set(next);
    void this.runSearch();
  }

  selectCategory(category: string): void {
    this.activeCategory.set(this.activeCategory() === category ? '' : category);
    void this.runSearch();
  }

  setLevel(value: string): void {
    const next = LEVEL_OPTIONS.find((option) => option.key === value)?.key ?? '';
    this.activeLevel.set(next);
    void this.runSearch();
  }

  clearFilters(): void {
    this.activeCategory.set('');
    this.activeLevel.set('');
    this.searchTerm.set('');
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    if (this.loading()) {
      return;
    }
    const criteria: CatalogCriteria = {
      q: this.searchTerm().trim(),
      category: this.activeCategory(),
      level: this.activeLevel(),
      sort: this.sort(),
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
      this.searched.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los cursos. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
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
    return LEVEL_OPTIONS.find((option) => option.key === level)?.label ?? level;
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

  // ─── Course PDP ───────────────────────────────────────────────────────────────
  openCourse(course: AcademyCourse): void {
    void this.loadCourse(course.id);
  }

  backToCatalog(): void {
    this.view.set('catalog');
    this.detail.set(null);
    this.errorMessage.set('');
  }

  private async loadCourse(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`course:${id}`, () =>
        this.#api.course(this.apiBase(), id, this.currency()),
      );
      this.detail.set(detail);
      const featured = detail.plans.find((plan) => plan.featured) ?? detail.plans[0] ?? null;
      this.selectedPlanId.set(featured?.id ?? '');
      // Expand the first section by default.
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

  lessonIcon(lesson: AcademyLesson): string {
    switch (lesson.kind) {
      case 'reading':
        return '📄';
      case 'quiz':
        return '✓';
      case 'assignment':
        return '📝';
      default:
        return '▶';
    }
  }

  // ─── Enrolment ────────────────────────────────────────────────────────────────
  /** CTA on the PDP. Free → enroll directo; paid → checkout wizard. */
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
    this.enrollStep.set('plan');
    this.view.set('checkout');
  }

  private async enrollFree(detail: CourseDetail): Promise<void> {
    const plan = this.selectedPlan() ?? detail.plans[0] ?? null;
    await this.selectIntoCart(detail.course, plan);
    // Free enrol: skip the wizard, take the (no-cost) pay + confirm path directly.
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

  // ─── Enrolment wizard ────────────────────────────────────────────────────────
  nextEnrollStep(): void {
    const step = this.enrollStep();
    if (step === 'plan') {
      if (!this.selectedPlan()) {
        return;
      }
      this.enrollStep.set('student');
    } else if (step === 'student') {
      if (!this.studentValid()) {
        return;
      }
      this.enrollStep.set('review');
    }
  }

  previousEnrollStep(): void {
    const step = this.enrollStep();
    if (step === 'review') {
      this.enrollStep.set('student');
    } else if (step === 'student') {
      this.enrollStep.set('plan');
    } else {
      this.view.set('course');
    }
  }

  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }

  cancelEnrollment(): void {
    this.view.set('course');
    this.errorMessage.set('');
  }

  /** Confirm step CTA — single payment + confirm for the enrolment. */
  confirmEnrollment(): void {
    if (!this.studentValid()) {
      return;
    }
    void this.placeEnrollmentFromWizard();
  }

  private async placeEnrollmentFromWizard(): Promise<void> {
    const detail = this.detail();
    const plan = this.selectedPlan();
    if (!detail || !plan) {
      return;
    }
    await this.selectIntoCart(detail.course, plan);
    await this.placeEnrollment();
  }

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
      // FulfillmentContext routes pay → confirm to the academy strategy.
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
            provider: this.isFreeCourse()
              ? 'academy-free'
              : this.paymentMethod() === 'pse'
                ? 'academy-pse'
                : 'academy-card',
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

      this.enrollmentId.set(enrollmentId);
      this.enrolledCourseId.set(courseId);
      this.#store.setStatus('confirmed');
      this.loading.set(false);

      // Matrícula activa → bridge then unlock the classroom.
      this.view.set('enrolled');
      const payload = { courseId, enrollmentId };
      this.enrolled.emit(payload);
      this.#bus.publish('enrolled', payload);

      // Prime classroom state from the (possibly mock) progress endpoint.
      await this.loadProgress(courseId, student.email);
    } catch (error) {
      this.loading.set(false);
      this.errorMessage.set('No pudimos completar la inscripción. Intenta de nuevo.');
      this.#store.setStatus('building');
      void error;
    }
  }

  // ─── Classroom (gated to enrolled) ───────────────────────────────────────────
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
    this.view.set('classroom');
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
  }

  previousLesson(): void {
    const index = this.activeLessonIndex();
    if (index > 0) {
      this.activeLessonId.set(this.orderedLessons()[index - 1].id);
      this.classroomTab.set('overview');
    }
  }

  nextLesson(): void {
    const index = this.activeLessonIndex();
    const lessons = this.orderedLessons();
    if (index >= 0 && index < lessons.length - 1) {
      this.activeLessonId.set(lessons[index + 1].id);
      this.classroomTab.set('overview');
    }
  }

  isLessonComplete(lessonId: string): boolean {
    return this.completedLessonIds().includes(lessonId);
  }

  setClassroomTab(tab: 'overview' | 'resources' | 'qa' | 'assignment'): void {
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
    // Optimistic update.
    const before = this.completedLessonIds();
    const next = complete
      ? [...new Set([...before, lesson.id])]
      : before.filter((id) => id !== lesson.id);
    this.completedLessonIds.set(next);
    const optimisticPercent = Math.round((next.length / total) * 100);
    this.progressPercent.set(optimisticPercent);

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
    } catch (error) {
      // Keep the optimistic value on failure — the mock fallback returns it anyway.
      void error;
    }

    if (complete) {
      const payload = { courseId, lessonId: lesson.id, percent: this.progressPercent() };
      this.lessoncompleted.emit(payload);
      this.#bus.publish('lessoncompleted', payload);
    }
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
    // Submitting a required assignment counts toward completion.
    if (!this.isLessonComplete(lesson.id)) {
      void this.toggleLessonComplete(lesson, true);
    }
  }

  // ─── Certificate ──────────────────────────────────────────────────────────────
  viewCertificate(): void {
    if (!this.isCourseComplete()) {
      return;
    }
    let cert = this.certificate();
    if (!cert) {
      cert = buildMockCertificate(
        this.studentName().trim() || 'Estudiante Synergos',
        this.detail()?.course.title ?? 'Curso Synergos',
      );
      this.certificate.set(cert);
      const payload = { courseId: this.enrolledCourseId(), certificateId: cert.id };
      this.certified.emit(payload);
      this.#bus.publish('certified', payload);
    }
    this.view.set('certificate');
  }

  backToClassroom(): void {
    this.view.set('classroom');
  }

  printCertificate(): void {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────
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
    this.enrollStep.set('plan');
    this.view.set('catalog');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
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
    try {
      return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  /** es-CO grouped integer (no Angular pipe → keeps `imports: []`). */
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
