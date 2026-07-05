import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { GovApiClient } from './gov-api.client';
import {
  CASE_STATUS_HINTS,
  CASE_STATUS_LABELS,
  CASE_TRANSITIONS,
  ONCE_ONLY_PROFILE,
  TRANSITION_ACTION_LABELS,
  canTransition,
  isTerminal,
  type ApplyStep,
  type CaseStatus,
  type DocRef,
  type FormFieldDef,
  type GovCase,
  type GovRole,
  type GovView,
  type TramiteCategory,
  type TramiteDetail,
  type TramiteSummary,
} from './gov.model';

/**
 * Runtime config for the CMS element <c>elementSynGov</c>.
 *
 * El dominio Gobierno/Trámites como portal de servicios al ciudadano — catálogo de
 * trámites (búsqueda + categorías) → ficha en lenguaje claro → radicación (wizard
 * **data-driven** desde la `formDefinition` del trámite + documentos + check-answers
 * GOV.UK + tasa opcional) → radicado + QR → mi carpeta / seguimiento del expediente,
 * y la consola de funcionario (bandeja + expediente + **transiciones legales** +
 * nota) tras el role-switch de demo. WCAG + lenguaje claro son de primera clase:
 * cada cambio de estado se anuncia en una región `role="status"` sin recarga.
 */
export interface GovRuntimeConfig {
  /** Base URL of the gov API. Default `/api/gov`. */
  readonly apiBase?: string;
  /** ISO currency for fee display. Default `COP`. */
  readonly currency?: string;
  /** Initial demo role: `citizen` or `officer`. Default `citizen`. */
  readonly role?: GovRole;
  /** Demo actor id for the inbox (e.g. `CC-52841903`). */
  readonly actor?: string;
}

const DEFAULT_API_BASE = '/api/gov';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_ROLE: GovRole = 'citizen';
const DEFAULT_ACTOR = 'CC-52841903';

const CATEGORIES: readonly { key: TramiteCategory | ''; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'identidad', label: 'Identidad' },
  { key: 'salud', label: 'Salud' },
  { key: 'tributario', label: 'Tributario' },
  { key: 'vehiculos', label: 'Vehículos' },
  { key: 'empresa', label: 'Empresa' },
];

const ROLES: readonly { key: GovRole; label: string }[] = [
  { key: 'citizen', label: 'Ciudadano' },
  { key: 'officer', label: 'Funcionario' },
];

const APPLY_STEP_LABELS: Readonly<Record<ApplyStep, string>> = {
  applicant: 'Sus datos',
  form: 'Datos del trámite',
  documents: 'Documentos',
  review: 'Revisar y enviar',
  payment: 'Pagar la tasa',
};

const QUEUE_FILTERS: readonly { key: CaseStatus | ''; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'radicado', label: 'Radicados' },
  { key: 'en-revision', label: 'En revisión' },
  { key: 'subsanacion', label: 'Subsanación' },
  { key: 'resuelto', label: 'Resueltos' },
  { key: 'rechazado', label: 'Rechazados' },
];

function normalizeRole(value: unknown): GovRole | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'citizen' || raw === 'officer' ? raw : undefined;
}

function sanitizeConfig(value: Partial<GovRuntimeConfig>): GovRuntimeConfig {
  return omitUndefinedProperties<GovRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    role: normalizeRole(value.role),
    actor: coerceTrimmedStringInput(value.actor),
  });
}

let govInstanceId = 0;

@Component({
  selector: 'sg-gov',
  standalone: true,
  imports: [],
  templateUrl: './gov.html',
  styleUrl: './gov.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Reuses published registry elements (qr-code, dropzone, timeline, alert-bar)
  // hydrated by the CMS shell.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-gov' },
})
export class GovElementComponent {
  readonly #api = inject(GovApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<GovRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<GovRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly actorInput = input<string | undefined>(undefined, { alias: 'actor' });

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
  readonly actor = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.actorInput()),
      this.config()?.actor,
      DEFAULT_ACTOR,
    ),
  );

  readonly instanceId = (govInstanceId += 1);
  readonly fieldId = `syn-gov-${this.instanceId}`;
  readonly categories = CATEGORIES;
  readonly roles = ROLES;
  readonly queueFilters = QUEUE_FILTERS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly viewchange = output<GovView>();
  readonly rolechange = output<GovRole>();
  readonly applicationsubmitted = output<{ caseId: string; radicado: string }>();
  readonly casetransition = output<{ caseId: string; to: CaseStatus }>();

  // ─── Shell state ───────────────────────────────────────────────────────────
  readonly role = signal<GovRole>(DEFAULT_ROLE);
  readonly view = signal<GovView>('catalog');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  /** Announced via role="status" — WCAG: state changes without a reload. */
  readonly announcement = signal('');

  // ─── Catálogo ──────────────────────────────────────────────────────────────
  readonly searchTerm = signal('');
  readonly category = signal('');
  readonly tramites = signal<readonly TramiteSummary[]>([]);
  readonly total = signal(0);
  readonly searched = signal(false);

  // ─── Ficha + wizard de radicación (data-driven) ────────────────────────────
  readonly detail = signal<TramiteDetail | null>(null);
  readonly applyStep = signal<ApplyStep>('applicant');
  readonly answers = signal<Readonly<Record<string, string>>>({});
  readonly docs = signal<readonly DocRef[]>([]);
  readonly paid = signal(false);

  // Applicant (prefilled once-only, editable).
  readonly applicantName = signal(ONCE_ONLY_PROFILE.name);
  readonly applicantDocType = signal(ONCE_ONLY_PROFILE.docType);
  readonly applicantDocNumber = signal(ONCE_ONLY_PROFILE.docNumber);
  readonly applicantEmail = signal(ONCE_ONLY_PROFILE.email);
  readonly applicantPhone = signal(ONCE_ONLY_PROFILE.phone);

  // ─── Radicado / carpeta / expediente ───────────────────────────────────────
  readonly confirmedCase = signal<GovCase | null>(null);
  readonly myCases = signal<readonly GovCase[]>([]);
  readonly activeCase = signal<GovCase | null>(null);
  readonly subsanacionNote = signal('');

  // ─── Funcionario ───────────────────────────────────────────────────────────
  readonly queueCases = signal<readonly GovCase[]>([]);
  readonly queueFilter = signal('');
  readonly officerNote = signal('');

  // ─── Derived ───────────────────────────────────────────────────────────────
  readonly degraded = computed(() => {
    void this.searched();
    void this.view();
    void this.detail();
    void this.confirmedCase();
    void this.myCases();
    void this.queueCases();
    return this.#api.degraded;
  });

  /** Wizard steps — the payment step exists only when the trámite has a fee. */
  readonly applySteps = computed<readonly ApplyStep[]>(() => {
    const base: readonly ApplyStep[] = ['applicant', 'form', 'documents', 'review'];
    return this.hasFee() ? [...base, 'payment'] : base;
  });

  readonly hasFee = computed(() => {
    const fee = this.detail()?.fee;
    return !!fee && fee.amount > 0 && !fee.exempt;
  });

  /** The dynamic fields the current trámite's definition dictates. */
  readonly formFields = computed<readonly FormFieldDef[]>(
    () => this.detail()?.formDefinition ?? [],
  );

  readonly applicantValid = computed(
    () =>
      this.applicantName().trim().length >= 3 &&
      this.applicantDocNumber().trim().length >= 5 &&
      /.+@.+\..+/.test(this.applicantEmail().trim()),
  );

  /** Every required field of the data-driven form has an answer. */
  readonly formValid = computed(() => {
    const current = this.answers();
    return this.formFields().every(
      (field) => !field.required || (current[field.key] ?? '').trim() !== '',
    );
  });

  /** At least one document when the trámite lists required documents. */
  readonly documentsValid = computed(
    () => (this.detail()?.requirements.length ?? 0) === 0 || this.docs().length > 0,
  );

  readonly canSubmit = computed(
    () =>
      this.applicantValid() &&
      this.formValid() &&
      this.documentsValid() &&
      (!this.hasFee() || this.paid()),
  );

  /** Legal next states for the open expediente (officer actions). */
  readonly nextStatuses = computed<readonly CaseStatus[]>(() => {
    const kase = this.activeCase();
    return kase ? CASE_TRANSITIONS[kase.status] : [];
  });

  readonly filteredQueue = computed(() => {
    const filter = this.queueFilter();
    const cases = this.queueCases();
    return filter ? cases.filter((kase) => kase.status === filter) : cases;
  });

  readonly queueKpis = computed(() => {
    const cases = this.queueCases();
    const count = (status: CaseStatus): number =>
      cases.filter((kase) => kase.status === status).length;
    return {
      pending: count('radicado'),
      reviewing: count('en-revision'),
      subsanacion: count('subsanacion'),
      closed: count('resuelto') + count('rechazado'),
    };
  });

  /** `eventsJson` for the published <synergos-timeline> element (citizen tracking). */
  readonly timelineJson = computed(() => {
    const kase = this.activeCase();
    if (!kase) {
      return '[]';
    }
    return JSON.stringify(
      kase.timeline.map((entry) => ({
        date: entry.date,
        title: CASE_STATUS_LABELS[entry.status],
        body: entry.note ? `${entry.note} — ${entry.actor}` : entry.actor,
      })),
    );
  });

  constructor() {
    const cfg = this.config();
    this.role.set(normalizeRole(this.roleInput()) ?? cfg?.role ?? DEFAULT_ROLE);
    if (this.role() === 'officer') {
      void this.loadQueue();
    } else {
      void this.runSearch();
    }
  }

  // ─── Native input bindings ─────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Role switch (demo: citizen ↔ officer) ────────────────────────────────
  setRole(role: GovRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    this.errorMessage.set('');
    this.rolechange.emit(role);
    if (role === 'officer') {
      void this.loadQueue();
    } else {
      this.view.set('catalog');
      this.emitViewChange();
      void this.runSearch();
    }
  }

  // ─── Catálogo ──────────────────────────────────────────────────────────────
  submitSearch(): void {
    void this.runSearch();
  }

  setCategory(category: string): void {
    this.category.set(category);
    void this.runSearch();
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.category.set('');
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.view.set('catalog');
    try {
      const result = await this.#api.tramites(
        this.apiBase(),
        this.searchTerm().trim(),
        this.category(),
      );
      this.tramites.set(result.tramites);
      this.total.set(result.total);
      this.searched.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los trámites. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Ficha ─────────────────────────────────────────────────────────────────
  openTramite(tramite: TramiteSummary): void {
    void this.loadTramite(tramite.id);
  }

  backToCatalog(): void {
    this.view.set('catalog');
    this.detail.set(null);
    this.errorMessage.set('');
    this.emitViewChange();
  }

  private async loadTramite(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#api.tramite(this.apiBase(), id);
      this.detail.set(detail);
      this.view.set('detail');
      this.emitViewChange();
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el trámite. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Wizard de radicación ──────────────────────────────────────────────────
  startApplication(): void {
    if (!this.detail()) {
      return;
    }
    // Fresh draft; applicant stays prefilled (once-only) and editable.
    this.answers.set({});
    this.docs.set([]);
    this.paid.set(false);
    this.applyStep.set('applicant');
    this.view.set('apply');
    this.errorMessage.set('');
    this.announce('Inició la radicación. Paso 1: sus datos.');
    this.emitViewChange();
  }

  setAnswer(key: string, value: string): void {
    this.answers.update((current) => ({ ...current, [key]: value }));
  }

  bindAnswer(key: string): (event: Event) => void {
    return (event: Event) =>
      this.setAnswer(key, (event.target as HTMLInputElement | null)?.value ?? '');
  }

  toggleAnswer(key: string): (event: Event) => void {
    return (event: Event) =>
      this.setAnswer(key, (event.target as HTMLInputElement | null)?.checked ? 'true' : '');
  }

  answerOf(key: string): string {
    return this.answers()[key] ?? '';
  }

  /** Display value for check-answers: select answers show their option label. */
  answerLabel(field: FormFieldDef): string {
    const raw = this.answerOf(field.key);
    if (field.type === 'checkbox') {
      return raw === 'true' ? 'Sí' : 'No';
    }
    if (field.type === 'select') {
      return field.options.find((option) => option.value === raw)?.label ?? raw;
    }
    return raw;
  }

  stepLabel(step: ApplyStep): string {
    return APPLY_STEP_LABELS[step];
  }

  stepIndex(step: ApplyStep): number {
    return this.applySteps().indexOf(step);
  }

  isStepDone(step: ApplyStep): boolean {
    return this.stepIndex(step) < this.stepIndex(this.applyStep());
  }

  stepValid(step: ApplyStep): boolean {
    switch (step) {
      case 'applicant':
        return this.applicantValid();
      case 'form':
        return this.formValid();
      case 'documents':
        return this.documentsValid();
      default:
        return true;
    }
  }

  /** Jump back to a step from check-answers ("Cambiar", GOV.UK pattern). */
  goToStep(step: ApplyStep): void {
    if (this.applySteps().includes(step)) {
      this.applyStep.set(step);
      this.announce(`Paso: ${APPLY_STEP_LABELS[step]}.`);
    }
  }

  nextStep(): void {
    const steps = this.applySteps();
    const index = steps.indexOf(this.applyStep());
    if (!this.stepValid(this.applyStep()) || index < 0 || index >= steps.length - 1) {
      return;
    }
    const next = steps[index + 1];
    this.applyStep.set(next);
    this.announce(`Paso: ${APPLY_STEP_LABELS[next]}.`);
  }

  previousStep(): void {
    const steps = this.applySteps();
    const index = steps.indexOf(this.applyStep());
    if (index <= 0) {
      this.view.set('detail');
      this.emitViewChange();
      return;
    }
    this.applyStep.set(steps[index - 1]);
  }

  // ─── Documentos (dropzone reuse + native fallback) ─────────────────────────
  onDropzoneFiles(event: Event): void {
    const detail = (event as CustomEvent<{ accepted?: readonly { name?: string; size?: number }[] }>)
      .detail;
    const accepted = detail?.accepted ?? [];
    this.addDocuments(
      accepted.map((file) => ({ name: file.name ?? 'documento', size: file.size ?? 0 })),
    );
  }

  onNativeFiles(event: Event): void {
    const files = (event.target as HTMLInputElement | null)?.files;
    if (!files) {
      return;
    }
    this.addDocuments(Array.from(files).map((file) => ({ name: file.name, size: file.size })));
    (event.target as HTMLInputElement).value = '';
  }

  private addDocuments(files: readonly { name: string; size: number }[]): void {
    if (files.length === 0) {
      return;
    }
    this.docs.update((current) => [
      ...current,
      ...files
        .filter((file) => !current.some((doc) => doc.name === file.name))
        .map((file, index) => ({
          id: `DOC-${Date.now().toString(36)}-${current.length + index}`,
          name: file.name,
          size: file.size,
        })),
    ]);
    this.announce(`${files.length} documento(s) agregado(s).`);
  }

  removeDocument(id: string): void {
    this.docs.update((current) => current.filter((doc) => doc.id !== id));
  }

  // ─── Pago de tasa (stub visible — PSE simulado) ────────────────────────────
  payFee(): void {
    if (!this.hasFee() || this.paid()) {
      return;
    }
    this.paid.set(true);
    this.announce('Pago de la tasa aprobado (simulado).');
  }

  // ─── Radicar ───────────────────────────────────────────────────────────────
  submitApplication(): void {
    const detail = this.detail();
    if (!detail || !this.canSubmit() || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    void this.#submit(detail);
  }

  async #submit(detail: TramiteDetail): Promise<void> {
    try {
      const result = await this.#api.submitApplication(this.apiBase(), {
        tramiteId: detail.tramite.id,
        applicant: {
          name: this.applicantName().trim(),
          docType: this.applicantDocType(),
          docNumber: this.applicantDocNumber().trim(),
          email: this.applicantEmail().trim(),
          phone: this.applicantPhone().trim(),
        },
        answers: this.answers(),
        paid: this.paid(),
      });
      for (const doc of this.docs()) {
        await this.#api.uploadDocument(this.apiBase(), result.caseId, doc);
      }
      const caseDetail = await this.#api.getCase(this.apiBase(), result.caseId);
      this.confirmedCase.set(caseDetail.case);
      this.view.set('receipt');
      this.announce(`Su solicitud quedó radicada con el número ${result.radicado}.`);
      this.applicationsubmitted.emit({ caseId: result.caseId, radicado: result.radicado });
      this.emitViewChange();
    } catch (error) {
      this.errorMessage.set('No pudimos radicar la solicitud. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Mi carpeta (bandeja del ciudadano) ────────────────────────────────────
  goToFolder(): void {
    this.view.set('folder');
    this.errorMessage.set('');
    this.emitViewChange();
    void this.loadFolder();
  }

  private async loadFolder(): Promise<void> {
    this.loading.set(true);
    try {
      const cases = await this.#api.inbox(this.apiBase(), this.actor(), 'citizen');
      this.myCases.set(cases);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar su carpeta. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Seguimiento del expediente ────────────────────────────────────────────
  openCase(caseId: string): void {
    void this.loadCase(caseId, this.role() === 'officer' ? 'officer-case' : 'case');
  }

  backFromCase(): void {
    if (this.role() === 'officer') {
      this.view.set('queue');
      void this.loadQueue();
    } else {
      this.goToFolder();
      return;
    }
    this.activeCase.set(null);
    this.emitViewChange();
  }

  private async loadCase(caseId: string, target: GovView): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#api.getCase(this.apiBase(), caseId);
      this.activeCase.set(result.case);
      this.subsanacionNote.set('');
      this.officerNote.set('');
      this.view.set(target);
      this.emitViewChange();
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el expediente. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /** Citizen answers a subsanación → the expediente legally returns to review. */
  respondSubsanacion(): void {
    const kase = this.activeCase();
    if (!kase || kase.status !== 'subsanacion' || this.subsanacionNote().trim() === '') {
      return;
    }
    void this.#transition(
      kase,
      'en-revision',
      `Respuesta del ciudadano: ${this.subsanacionNote().trim()}`,
      kase.applicant.name,
    );
  }

  // ─── Funcionario: bandeja + transiciones legales ───────────────────────────
  goToQueue(): void {
    this.view.set('queue');
    this.errorMessage.set('');
    this.emitViewChange();
    void this.loadQueue();
  }

  setQueueFilter(filter: string): void {
    this.queueFilter.set(filter);
  }

  private async loadQueue(): Promise<void> {
    this.loading.set(true);
    try {
      const cases = await this.#api.inbox(this.apiBase(), this.actor(), 'officer');
      this.queueCases.set(cases);
      if (this.view() !== 'officer-case') {
        this.view.set('queue');
        this.emitViewChange();
      }
    } catch (error) {
      this.errorMessage.set('No pudimos cargar la bandeja. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /** Officer moves the expediente along a LEGAL transition (illegal = ignored). */
  transitionCase(to: CaseStatus): void {
    const kase = this.activeCase();
    if (!kase || !canTransition(kase.status, to) || this.loading()) {
      return;
    }
    void this.#transition(kase, to, this.officerNote().trim(), 'Funcionario de demo');
  }

  async #transition(kase: GovCase, to: CaseStatus, note: string, actor: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#api.transition(this.apiBase(), kase.caseId, to, note, actor);
      const refreshed = await this.#api.getCase(this.apiBase(), kase.caseId);
      this.activeCase.set(refreshed.case);
      this.subsanacionNote.set('');
      this.officerNote.set('');
      this.announce(`El expediente pasó a: ${CASE_STATUS_LABELS[result.status]}.`);
      this.casetransition.emit({ caseId: kase.caseId, to: result.status });
      if (this.role() === 'officer') {
        const cases = await this.#api.inbox(this.apiBase(), this.actor(), 'officer');
        this.queueCases.set(cases);
      } else {
        const cases = await this.#api.inbox(this.apiBase(), this.actor(), 'citizen');
        this.myCases.set(cases);
      }
    } catch (error) {
      this.errorMessage.set('No pudimos actualizar el expediente. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Labels / helpers (lenguaje claro) ─────────────────────────────────────
  statusLabel(status: CaseStatus): string {
    return CASE_STATUS_LABELS[status];
  }

  statusHint(status: CaseStatus): string {
    return CASE_STATUS_HINTS[status];
  }

  transitionLabel(to: CaseStatus): string {
    return TRANSITION_ACTION_LABELS[to];
  }

  isClosed(status: CaseStatus): boolean {
    return isTerminal(status);
  }

  categoryLabel(category: string): string {
    return CATEGORIES.find((entry) => entry.key === category)?.label ?? category;
  }

  channelLabel(channel: TramiteSummary['channel']): string {
    switch (channel) {
      case 'presencial':
        return 'Presencial';
      case 'mixto':
        return 'En línea y presencial';
      default:
        return '100% en línea';
    }
  }

  feeLabel(amount: number, currency?: string): string {
    if (amount <= 0) {
      return 'Gratuito';
    }
    return this.formatMoney(amount, currency || this.currency());
  }

  formatMoney(amount: number, currency: string): string {
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
      return new Intl.DateTimeFormat('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${iso}T00:00:00`));
    } catch {
      return iso;
    }
  }

  formatSize(bytes: number): string {
    if (bytes <= 0) {
      return '';
    }
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  }

  /** Answers of a case as rows for the officer's expediente view. */
  caseAnswers(kase: GovCase): readonly { key: string; value: string }[] {
    return Object.entries(kase.answers).map(([key, value]) => ({ key, value }));
  }

  daysLeftLabel(kase: GovCase): string {
    if (this.isClosed(kase.status)) {
      return 'Cerrado';
    }
    return kase.daysLeft === 1 ? '1 día restante' : `${kase.daysLeft} días restantes`;
  }

  private announce(message: string): void {
    this.announcement.set(message);
  }

  private emitViewChange(): void {
    this.viewchange.emit(this.view());
  }
}
