import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  AccountShellComponent,
  ConsoleShellComponent,
  DiscoveryShellComponent,
  DynamicFormShellComponent,
  MessageCenterComponent,
  TrackingTimelineComponent,
  type AccountShellConfig,
  type DiscoveryCriteria,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  type DynamicFormConfig,
  type DynamicFormSubmit,
  type FormSchema,
  type MessageCenterConfig,
  type TrackingStage,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { GovApiClient, isGovForbidden, isGovUnauthorized } from './gov-api.client';
import {
  OUTCOME_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  isClosedStatus,
  type ApplicationDetail,
  type ApplicationStatus,
  type ApplicationSummary,
  type DecisionOutcome,
  type GovCase,
  type GovForm,
  type GovRole,
  type GovService,
  type GovServiceDetail,
  type GovView,
  type QueueCase,
} from './gov.model';

/**
 * Runtime config for the CMS element <c>elementSynGov</c>.
 *
 * Gobierno **v2** — the GOV.CO/GOV.UK dual-face app (doc 21 §2.8 +
 * `deep-research/gobierno.md`) rebuilt as a **role-switch, hash-routed SPA**
 * (`#/gov/...`) and the Ola-8 consumer of the reusable shell catalogue
 * `@synergos/shells`:
 *
 *  - **CIUDADANO:** home discovery (SH-1) → ficha del trámite (task-list: pasos,
 *    elegibilidad, requisitos, fee) → iniciar solicitud (**SH-9** dynamic form +
 *    check-answers) → mis solicitudes (**SH-4** + timeline) → detalle de la
 *    solicitud (timeline + documentos + correspondencia **SH-7**) → subir doc.
 *  - **FUNCIONARIO:** cola de casos (**SH-5**: filtros por agencia/estado, SLA,
 *    prioridad) → revisar caso → decisión (aprobar/rechazar/pedir info + nota).
 *
 * 100% composable: no business is hardcoded; every knob comes from CMS props
 * (`apiBase`/`role`/`agency`/`config` JSON, patrón createConfigInputTransform/
 * resolveConfigValue) and data always comes from the API with visible mock
 * degradation. Shells stay domain-free (contrato D3) — the module only feeds
 * data + templates. WCAG AA + lenguaje claro GOV.UK are first-class (state
 * changes announced in a `role="status"` region without a reload).
 *
 * **Angular Elements lesson:** the initial fetch is NOT fired from the constructor
 * (inputs land AFTER construction); it fires from an `effect()` reactive to the
 * resolved identity/role, so a CMS-supplied `agency`/`role` re-fetches.
 *
 * **Quién es el ciudadano NO se compone (T2).** Hubo un prop `citizen` que el mount
 * mandaba como `?citizen=<email>`: era la identidad puesta por el cliente, o sea el
 * IDOR. Ahora la resuelve el servidor desde la cookie de sesión y aquí no hay knob
 * que valga — un `citizen` componible solo podría mentir. `agency` sí sigue: es un
 * filtro de la cola, no una identidad.
 */
export interface GovRuntimeConfig {
  /** Base URL of the gov API. Default `/api/gov`. */
  readonly apiBase?: string;
  /** Initial demo role. Default `citizen`. */
  readonly role?: GovRole;
  /** Agency scope for the officer queue (empty = all). Default `''`. */
  readonly agency?: string;
  /** Storage / hash-route scope. Default `gov`. */
  readonly scope?: string;
}

const DEFAULT_API_BASE = '/api/gov';
const DEFAULT_ROLE: GovRole = 'citizen';
const DEFAULT_AGENCY = '';
const DEFAULT_SCOPE = 'gov';
/** Autoservicio de members del CMS (ADR 0034). Acepta un `returnUrl` relativo. */
const LOGIN_PATH = '/account/login';

const ROLES: readonly { key: GovRole; label: string }[] = [
  { key: 'citizen', label: 'Ciudadano' },
  { key: 'officer', label: 'Funcionario' },
];

const CATEGORIES: readonly { key: string; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'identidad', label: 'Identidad' },
  { key: 'salud', label: 'Salud' },
  { key: 'tributario', label: 'Tributario' },
  { key: 'vehiculos', label: 'Vehículos' },
  { key: 'empresa', label: 'Empresa' },
];

const QUEUE_FILTERS: readonly { key: string; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'submitted', label: 'Radicadas' },
  { key: 'in-review', label: 'En revisión' },
  { key: 'info-requested', label: 'Requieren info' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
];

/** Views that belong to the officer face (used to align role on deep-link). */
const OFFICER_VIEWS: readonly GovView[] = ['queue', 'case'];

function coerceRole(value: unknown): GovRole | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'citizen' || raw === 'officer' ? raw : undefined;
}

function sanitizeConfig(value: Partial<GovRuntimeConfig>): GovRuntimeConfig {
  return omitUndefinedProperties<GovRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    role: coerceRole(value.role),
    agency: coerceTrimmedStringInput(value.agency),
    scope: coerceTrimmedStringInput(value.scope),
  });
}

let govInstanceId = 0;

@Component({
  selector: 'sg-gov',
  standalone: true,
  imports: [
    AccountShellComponent,
    ConsoleShellComponent,
    DiscoveryShellComponent,
    DynamicFormShellComponent,
    MessageCenterComponent,
    TrackingTimelineComponent,
  ],
  templateUrl: './gov.html',
  styleUrl: './gov.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Reuses published registry elements (qr-code) hydrated by the CMS shell.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-gov' },
})
export class GovElementComponent {
  readonly #api = inject(GovApiClient);
  readonly #destroyRef = inject(DestroyRef);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<GovRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<GovRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly agencyInput = input<string | undefined>(undefined, { alias: 'agency' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly initialRole = computed<GovRole>(() =>
    resolveConfigValue(coerceRole(this.roleInput()), this.config()?.role, DEFAULT_ROLE),
  );
  readonly agency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.agencyInput()),
      this.config()?.agency,
      DEFAULT_AGENCY,
    ),
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), this.config()?.scope, DEFAULT_SCOPE),
  );

  readonly instanceId = (govInstanceId += 1);
  readonly fieldId = `syn-gov-${this.instanceId}`;
  readonly roles = ROLES;
  readonly categories = CATEGORIES;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly viewchange = output<GovView>();
  readonly rolechange = output<GovRole>();
  readonly applicationsubmitted = output<{ id: string; reference: string }>();
  readonly casedecided = output<{ caseId: string; outcome: DecisionOutcome }>();

  // ─── Shell state ───────────────────────────────────────────────────────────
  readonly role = signal<GovRole>(DEFAULT_ROLE);
  readonly view = signal<GovView>('catalog');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  /**
   * El backend pidió sesión (401) para la carpeta del ciudadano. NO es `degraded`:
   * ahí no hay nada que degradar, hay que iniciar sesión. Se separan porque el
   * aviso de "datos de ejemplo" y el de "inicie sesión" son verdades distintas.
   */
  readonly unauthenticated = signal(false);
  /**
   * Acceso a la CONSOLA DEL FUNCIONARIO (cola/expediente/decisión), que ahora exige rol.
   * - `'ok'`: hay funcionario, se muestra la consola.
   * - `'anon'` (401): no hay sesión → ofrecer login.
   * - `'forbidden'` (403): hay sesión pero sin el rol → "no autorizado" (login NO ayuda,
   *   hace falta que un admin le dé el permiso).
   * Es distinto de `unauthenticated` (carpeta del ciudadano): son dos caras y dos verdades.
   */
  readonly officerAccess = signal<'ok' | 'anon' | 'forbidden'>('ok');
  /** Announced via role="status" — WCAG: state changes without a reload. */
  readonly announcement = signal('');
  #suppressedHash = '';
  /**
   * The scope (`role`/`agency`/`apiBase`) the current data was last loaded for. In
   * Angular Elements the attr→input lands AFTER the constructor, so the first read
   * is the default; the identity `effect()` re-loads the CURRENT view once the real
   * config arrives. `''` = "nothing loaded yet" (never equals a real value).
   */
  #lastIdentity = '';

  // ─── Catálogo (CIUDADANO — SH-1 discovery) ─────────────────────────────────
  readonly searchTerm = signal('');
  readonly category = signal('');
  readonly services = signal<readonly GovService[]>([]);
  readonly servicesLoaded = signal(false);

  // ─── Ficha del trámite ──────────────────────────────────────────────────────
  readonly service = signal<GovServiceDetail | null>(null);

  // ─── Iniciar solicitud (SH-9 dynamic form) ──────────────────────────────────
  readonly form = signal<GovForm | null>(null);
  readonly submitting = signal(false);
  readonly confirmedApplication = signal<ApplicationSummary | null>(null);

  // ─── Mis solicitudes (SH-4) + detalle ───────────────────────────────────────
  readonly applications = signal<readonly ApplicationSummary[]>([]);
  readonly applicationsLoaded = signal(false);
  readonly activeApplication = signal<ApplicationDetail | null>(null);
  readonly uploadName = signal('');
  // SH-7 correspondence (from the active application/case).
  readonly activeThreadId = signal<string | null>(null);
  readonly sendingMessage = signal(false);

  // ─── Funcionario (SH-5 console) ─────────────────────────────────────────────
  readonly queueCases = signal<readonly QueueCase[]>([]);
  readonly queueLoaded = signal(false);
  readonly queueFilter = signal('');
  readonly activeCase = signal<GovCase | null>(null);
  readonly decisionNote = signal('');

  // ─── Derived ────────────────────────────────────────────────────────────────
  readonly degraded = computed(() => {
    void this.servicesLoaded();
    void this.service();
    void this.confirmedApplication();
    void this.applicationsLoaded();
    void this.activeApplication();
    void this.queueLoaded();
    void this.activeCase();
    return this.#api.degraded;
  });

  readonly hasFee = computed(() => (this.service()?.feeMinor ?? 0) > 0);

  // ─── SH-9 dynamic-form schema + config ──────────────────────────────────────
  readonly formSchema = computed<FormSchema>(() => {
    const form = this.form();
    return form ? { title: form.title, sections: form.sections } : { sections: [] };
  });

  readonly formConfig: DynamicFormConfig = {
    submitLabel: 'Radicar solicitud',
    submittingLabel: 'Radicando…',
    reviewLabel: 'Revisar y enviar',
    checkAnswersTitle: 'Revise sus respuestas antes de radicar',
  };

  // ─── SH-4 account config (mis solicitudes) ──────────────────────────────────
  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mis solicitudes',
    navLabel: 'Secciones de mi carpeta',
    inboxEmptyMessage: 'Aún no tiene solicitudes radicadas. Empiece por el catálogo.',
    inboxLoadingMessage: 'Cargando sus solicitudes…',
    detailPlaceholder: 'Seleccione una solicitud para ver su seguimiento.',
    sections: [
      { id: 'all', label: 'Todas', kind: 'inbox', badge: this.applications().length || undefined },
    ],
  }));

  /** Tracking-timeline stages for the active application (SH-4 detail). */
  readonly applicationStages = computed<readonly TrackingStage[]>(() =>
    (this.activeApplication()?.timeline ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      date: entry.date ? this.formatDate(entry.date) : undefined,
      description: entry.note,
      state: entry.state,
    })),
  );

  // ─── SH-7 message config ─────────────────────────────────────────────────────
  readonly messageConfig: MessageCenterConfig = {
    heading: 'Correspondencia',
    listLabel: 'Mensajes de la solicitud',
    emptyMessage: 'No hay mensajes en esta solicitud.',
    detailPlaceholder: 'Seleccione un mensaje para leerlo.',
    composerLabel: 'Escribir a la agencia',
    composerPlaceholder: 'Escriba un mensaje a la agencia…',
    sendLabel: 'Enviar',
    sendingLabel: 'Enviando…',
  };

  /** Correspondence messages of the active application (SH-7 threads). */
  readonly correspondence = computed(() => this.activeApplication()?.messages ?? []);
  readonly activeMessage = computed(() => {
    const id = this.activeThreadId();
    return id ? (this.correspondence().find((msg) => msg.id === id) ?? null) : null;
  });

  // ─── SH-5 console config (cola del funcionario) ─────────────────────────────
  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Cola de casos',
    navLabel: 'Secciones de la consola',
    kpisLabel: 'Indicadores de la cola',
    filtersLabel: 'Filtrar por estado',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay casos con ese filtro.',
    loadingMessage: 'Cargando la cola…',
    sections: [
      { id: 'queue', label: 'Casos asignados', kind: 'table', badge: this.queueCases().length || undefined },
    ],
  }));

  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() => {
    const cases = this.queueCases();
    const count = (status: ApplicationStatus): number =>
      cases.filter((kase) => kase.status === status).length;
    const overdue = cases.filter((kase) => kase.slaDaysLeft < 0 && !isClosedStatus(kase.status)).length;
    return [
      { id: 'pending', label: 'Por revisar', value: String(count('submitted')) },
      { id: 'reviewing', label: 'En revisión', value: String(count('in-review')) },
      { id: 'info', label: 'Requieren info', value: String(count('info-requested')) },
      { id: 'overdue', label: 'Vencidos', value: String(overdue) },
    ];
  });

  readonly consoleColumns: readonly ConsoleColumn[] = [
    { key: 'reference', label: 'Radicado' },
    { key: 'serviceName', label: 'Trámite' },
    { key: 'citizenName', label: 'Solicitante' },
    { key: 'status', label: 'Estado' },
    { key: 'priority', label: 'Prioridad' },
    { key: 'sla', label: 'SLA', align: 'end' },
  ];

  readonly consoleActions: readonly ConsoleRowAction[] = [
    { id: 'open', label: 'Revisar', kind: 'primary' },
  ];

  readonly consoleFilters = computed(() => QUEUE_FILTERS.map((f) => ({ key: f.key, label: f.label })));

  /** Legal officer decisions for the open case (closed cases → none). */
  readonly caseOutcomes = computed<readonly DecisionOutcome[]>(() => {
    const kase = this.activeCase();
    if (!kase || isClosedStatus(kase.application.status)) {
      return [];
    }
    return ['approve', 'request-info', 'reject'];
  });

  /** Officer case timeline as SH-4 tracking stages (reused in the case view). */
  readonly caseStages = computed<readonly TrackingStage[]>(() =>
    (this.activeCase()?.timeline ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      date: entry.date ? this.formatDate(entry.date) : undefined,
      description: entry.note,
      state: entry.state,
    })),
  );

  constructor() {
    const initialRole = this.initialRole();
    this.role.set(initialRole);
    this.view.set(initialRole === 'officer' ? 'queue' : 'catalog');

    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }
    this.#destroyRef.onDestroy(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });

    // Resolve the initial route from the hash (deep-link) BEFORE any data loads so
    // the identity effect reloads the RIGHT view.
    this.applyHash();

    // Identity effect: fires with the default first, then again once the CMS-supplied
    // `agency`/`role` land after construction (Angular Elements lifecycle),
    // re-fetching against the real scope. Guarded by `#lastIdentity` so it never
    // loops. This is the fix that avoids the constructor-fetch anti-pattern.
    effect(() => {
      const identity = `${this.initialRole()}|${this.agency()}|${this.apiBase()}`;
      if (identity === this.#lastIdentity) {
        return;
      }
      this.#lastIdentity = identity;
      untracked(() => this.reloadForIdentity());
    });
  }

  /** Reset caches for the new identity and reload the current view. */
  private reloadForIdentity(): void {
    this.#api.resetDegraded();
    // Align the role to the CMS-supplied one if it changed.
    if (this.role() !== this.initialRole()) {
      this.role.set(this.initialRole());
      if (!OFFICER_VIEWS.includes(this.view()) && this.initialRole() === 'officer') {
        this.view.set('queue');
      } else if (OFFICER_VIEWS.includes(this.view()) && this.initialRole() === 'citizen') {
        this.view.set('catalog');
      }
    }
    this.servicesLoaded.set(false);
    this.applicationsLoaded.set(false);
    this.queueLoaded.set(false);
    this.activeApplication.set(null);
    this.activeCase.set(null);
    // El 401/403 se vuelve a preguntar contra el nuevo apiBase; no se arrastran.
    this.unauthenticated.set(false);
    this.officerAccess.set('ok');
    this.loadForView(this.view());
  }

  // ─── Native input bindings ─────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) =>
      setter((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '');
  }

  // ─── Role switch (navegación entre journeys: citizen ↔ officer) ─────────────
  // No es un tablist: cada perfil abre un portal completo distinto. La UI lo
  // trata como <nav aria-current>; aquí se anuncia el cambio en la región
  // aria-live para lectores de pantalla (WCAG: estado sin recarga).
  setRole(role: GovRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    this.errorMessage.set('');
    this.rolechange.emit(role);
    this.navigate(role === 'officer' ? 'queue' : 'catalog');
    this.announce(`Cambió al perfil ${ROLES.find((r) => r.key === role)?.label ?? ''}.`);
  }

  /**
   * Salida del panel "no autorizado" del funcionario hacia el portal ciudadano. NO puede ser
   * `setRole('citizen')` a secas: si se llegó por deep-link a `#/gov/gestion`, el `role()` ya
   * es 'citizen' (el toggle nunca se pulsó) y `setRole` haría early-return dejando el botón
   * MUERTO en el panel. Aquí se navega SIEMPRE al catálogo, alineando el rol de paso.
   */
  goToCitizenPortal(): void {
    this.officerAccess.set('ok');
    if (this.role() === 'officer') {
      this.setRole('citizen');
      return;
    }
    this.role.set('citizen');
    this.navigate('catalog');
  }

  // ─── Router (signals + hash deep-links) ────────────────────────────────────
  navigate(view: GovView, param = ''): void {
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  private applyRoute(view: GovView, param: string): void {
    this.view.set(view);
    this.errorMessage.set('');
    this.viewchange.emit(view);
    this.loadForView(view, param);
  }

  /** Data dispatch by view (respects deep-links; cached views skip re-fetch). */
  private loadForView(view: GovView, param = ''): void {
    switch (view) {
      case 'catalog':
        if (!this.servicesLoaded()) {
          void this.runSearch();
        }
        return;
      case 'service':
        if (param && this.service()?.id !== param) {
          void this.loadService(param);
        }
        return;
      case 'applications':
        if (!this.applicationsLoaded()) {
          void this.loadApplications();
        }
        return;
      case 'application':
        if (param) {
          void this.loadApplication(param);
        }
        return;
      case 'queue':
        if (!this.queueLoaded()) {
          void this.loadQueue();
        }
        return;
      case 'case':
        if (param) {
          void this.loadCase(param);
        }
        return;
      default:
        return;
    }
  }

  private routeHash(view: GovView, param: string): string {
    const base = `#/${this.scope()}`;
    switch (view) {
      case 'catalog':
        return base;
      case 'service':
        return `${base}/tramite/${encodeURIComponent(param)}`;
      case 'apply':
        return `${base}/tramite/${encodeURIComponent(param || this.service()?.id || '')}/radicar`;
      case 'receipt':
        return `${base}/radicado`;
      case 'applications':
        return `${base}/mis-solicitudes`;
      case 'application':
        return `${base}/solicitud/${encodeURIComponent(param)}`;
      case 'queue':
        return `${base}/gestion`;
      case 'case':
        return `${base}/gestion/${encodeURIComponent(param)}`;
      default:
        return base;
    }
  }

  private writeHash(view: GovView, param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = this.routeHash(view, param);
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
    const [head = '', tail = '', sub = ''] = segments;
    let target: GovView = this.role() === 'officer' ? 'queue' : 'catalog';
    let param = '';
    switch (head) {
      case '':
        target = 'catalog';
        break;
      case 'tramite':
        target = sub === 'radicar' ? 'apply' : 'service';
        param = tail;
        break;
      case 'mis-solicitudes':
        target = 'applications';
        break;
      case 'solicitud':
        target = 'application';
        param = tail;
        break;
      case 'gestion':
        target = tail ? 'case' : 'queue';
        param = tail;
        break;
      default:
        break;
    }
    // Align the role with the face the target belongs to.
    if (OFFICER_VIEWS.includes(target) && this.role() !== 'officer') {
      this.role.set('officer');
    } else if (!OFFICER_VIEWS.includes(target) && this.role() === 'officer') {
      this.role.set('citizen');
    }
    // For `apply` we need the service loaded first; route to service if missing.
    if (target === 'apply' && this.service()?.id !== param) {
      void this.loadService(param, true);
      return;
    }
    this.applyRoute(target, param);
  }

  // ─── Catálogo (SH-1 discovery) ──────────────────────────────────────────────
  /** SH-1 `criteriachange`: re-query with the term + the `category` facet. */
  onDiscoveryChange(criteria: DiscoveryCriteria): void {
    this.searchTerm.set(criteria.term);
    this.category.set(criteria.facets['category']?.[0] ?? '');
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const services = await this.#api.services(this.apiBase(), this.searchTerm().trim(), this.category());
      this.services.set(services);
      this.servicesLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los trámites. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Ficha ──────────────────────────────────────────────────────────────────
  openService(service: GovService): void {
    this.navigate('service', service.id);
  }

  backToCatalog(): void {
    this.navigate('catalog');
  }

  private async loadService(id: string, thenApply = false): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#api.service(this.apiBase(), id);
      this.service.set(detail);
      if (thenApply) {
        await this.ensureForm(id);
        this.navigate('apply', id);
      }
      // Non-apply: the view was already set by `applyRoute` before dispatch.
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el trámite. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Iniciar solicitud (SH-9) ───────────────────────────────────────────────
  startApplication(): void {
    const service = this.service();
    if (!service) {
      return;
    }
    void this.beginApplication(service.id);
  }

  private async ensureForm(serviceId: string): Promise<void> {
    if (this.form()?.id && this.service()?.id === serviceId && this.form()) {
      return;
    }
    const form = await this.#api.form(this.apiBase(), serviceId);
    this.form.set(form);
  }

  private async beginApplication(serviceId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.ensureForm(serviceId);
      this.navigate('apply', serviceId);
      this.announce('Empezó la solicitud. Complete las tareas del formulario.');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el formulario. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /** SH-9 (submit) — radica la solicitud contra el contrato. */
  onFormSubmit(event: DynamicFormSubmit): void {
    const service = this.service();
    if (!service || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    void this.#radicar(service, event.answers);
  }

  async #radicar(service: GovServiceDetail, answers: Readonly<Record<string, string>>): Promise<void> {
    try {
      const summary = await this.#api.createApplication(this.apiBase(), {
        serviceId: service.id,
        answers,
      });
      this.confirmedApplication.set(summary);
      this.applicationsLoaded.set(false); // folder must refetch to include the new one
      this.navigate('receipt');
      this.announce(`Su solicitud quedó radicada con el número ${summary.reference}.`);
      this.applicationsubmitted.emit({ id: summary.id, reference: summary.reference });
    } catch (error) {
      this.errorMessage.set('No pudimos radicar la solicitud. Intente de nuevo.');
      void error;
    } finally {
      this.submitting.set(false);
    }
  }

  // ─── Mis solicitudes (SH-4) ─────────────────────────────────────────────────
  goToApplications(): void {
    this.navigate('applications');
  }

  private async loadApplications(): Promise<void> {
    this.loading.set(true);
    try {
      const apps = await this.#api.applications(this.apiBase());
      this.applications.set(apps);
      this.applicationsLoaded.set(true);
      this.unauthenticated.set(false);
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage.set('No pudimos cargar sus solicitudes. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Traduce un 401 al ÚNICO estado que lo sabe pintar: la carpeta con el panel "Inicie
   * sesión". Devuelve `true` si el error era ese, para que quien llama corte ahí.
   *
   * Aterriza SIEMPRE en la vista `applications` (única que renderiza el panel), sin
   * importar desde dónde saltó el 401 (carpeta, detalle, subir documento). Si no, un 401
   * en el detalle dejaba al usuario vidente sin ninguna señal: el aviso solo iba a la
   * región aria-live (sr-only). Y deja la carpeta HONESTA: `applications=[]` +
   * `applicationsLoaded=true` para que el badge del nav no siga mostrando un conteo
   * viejo mientras el cuerpo pide iniciar sesión.
   */
  private handleUnauthorized(error: unknown, announcement?: string): boolean {
    if (!isGovUnauthorized(error)) {
      return false;
    }
    this.unauthenticated.set(true);
    this.errorMessage.set('');
    this.activeApplication.set(null);
    this.applications.set([]);
    this.applicationsLoaded.set(true);
    this.announce(announcement ?? 'Necesita iniciar sesión para ver sus solicitudes.');
    if (this.view() !== 'applications') {
      this.navigate('applications');
    }
    return true;
  }

  /**
   * Login del CMS de vuelta a ESTA página (con su hash, para caer en la misma vista).
   * Es un método y no un `computed` a propósito: el hash cambia con la navegación y un
   * computed cacheado devolvería el de la primera lectura.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return LOGIN_PATH;
    }
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `${LOGIN_PATH}?returnUrl=${encodeURIComponent(here)}`;
  }

  openApplication(app: ApplicationSummary): void {
    this.navigate('application', app.id);
  }

  private async loadApplication(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#api.application(this.apiBase(), id);
      this.activeApplication.set(detail);
      this.activeThreadId.set(null);
      this.unauthenticated.set(false);
      // View was already set by `applyRoute` before dispatch — do not re-route.
    } catch (error) {
      // Deep-link a un expediente sin sesión: handleUnauthorized rebota a la carpeta,
      // que es donde vive el panel "inicie sesión".
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage.set('No pudimos abrir su solicitud. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Subir documento ────────────────────────────────────────────────────────
  onDocumentFile(event: Event): void {
    const files = (event.target as HTMLInputElement | null)?.files;
    if (files && files.length > 0) {
      this.uploadName.set(files[0].name);
    }
  }

  uploadDocument(): void {
    const app = this.activeApplication();
    const name = this.uploadName().trim();
    if (!app || name === '' || this.loading()) {
      return;
    }
    void this.#upload(app.id, name);
  }

  async #upload(applicationId: string, name: string): Promise<void> {
    this.loading.set(true);
    try {
      const doc = await this.#api.uploadDocument(this.apiBase(), { applicationId, name });
      // Reflect the new document in the open detail (optimistic reconcile).
      this.activeApplication.update((current) =>
        current ? { ...current, documents: [...current.documents, doc] } : current,
      );
      this.uploadName.set('');
      this.announce(`Documento "${doc.name}" adjuntado.`);
    } catch (error) {
      // Sesión expirada a mitad del detalle: handleUnauthorized rebota a la carpeta con
      // el panel de login (antes fallaba en silencio — el aviso solo iba a la región
      // sr-only y la vista de detalle no pinta el panel).
      if (this.handleUnauthorized(error, 'Su sesión expiró. Inicie sesión para adjuntar el documento.')) {
        this.uploadName.set('');
        return;
      }
      this.errorMessage.set('No pudimos subir el documento. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Correspondencia (SH-7) ─────────────────────────────────────────────────
  onThreadSelect(message: { id: string }): void {
    this.activeThreadId.set(message.id);
  }

  onSendMessage(event: { body: string }): void {
    const app = this.activeApplication();
    const body = event.body.trim();
    if (!app || body === '' || this.sendingMessage()) {
      return;
    }
    // Optimistic local append (no message-send endpoint in the contract; the
    // correspondence graph is server-driven via decisions, so we reflect locally).
    const local = {
      id: `local-${Date.now().toString(36)}`,
      author: 'Usted',
      body,
      createdAtUtc: new Date().toISOString(),
      outgoing: true,
    };
    this.activeApplication.update((current) =>
      current ? { ...current, messages: [...current.messages, local] } : current,
    );
    this.activeThreadId.set(local.id);
    this.announce('Mensaje enviado a la agencia.');
  }

  // ─── Funcionario: cola (SH-5) ───────────────────────────────────────────────
  goToQueue(): void {
    this.navigate('queue');
  }

  onConsoleFilterChange(filter: string): void {
    this.queueFilter.set(filter);
    this.queueLoaded.set(false);
    void this.loadQueue();
  }

  private async loadQueue(): Promise<void> {
    this.loading.set(true);
    try {
      const cases = await this.#api.queue(this.apiBase(), this.agency(), this.queueFilter());
      this.queueCases.set(cases);
      this.queueLoaded.set(true);
      this.officerAccess.set('ok');
    } catch (error) {
      if (this.handleOfficerDenied(error)) {
        return;
      }
      this.errorMessage.set('No pudimos cargar la cola de casos. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Traduce un 401/403 de la consola del funcionario a `officerAccess` y vacía la cola/caso
   * para no dejar a la vista datos que ya no debe ver. Devuelve `true` si era ese error.
   * - 401 → `'anon'` (ofrecer login), 403 → `'forbidden'` (no autorizado; login no ayuda).
   */
  private handleOfficerDenied(error: unknown): boolean {
    const anon = isGovUnauthorized(error);
    if (!anon && !isGovForbidden(error)) {
      return false;
    }
    this.officerAccess.set(anon ? 'anon' : 'forbidden');
    this.errorMessage.set('');
    this.queueCases.set([]);
    this.activeCase.set(null);
    this.announce(anon
      ? 'Inicie sesión como funcionario para ver la cola.'
      : 'Su cuenta no tiene permiso de funcionario.');
    // Aterriza SIEMPRE en 'queue' (única vista que pinta el panel), venga de la cola o de
    // un expediente — igual que el ciudadano cae siempre en 'applications'.
    if (this.view() !== 'queue') {
      this.navigate('queue');
    }
    return true;
  }

  onConsoleRowAction(event: ConsoleRowActionEvent<QueueCase>): void {
    if (event.actionId === 'open') {
      this.openCase(event.row.id);
    }
  }

  openCase(caseId: string): void {
    this.navigate('case', caseId);
  }

  private async loadCase(caseId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const kase = await this.#api.case(this.apiBase(), caseId);
      this.activeCase.set(kase);
      this.decisionNote.set('');
      this.officerAccess.set('ok');
      // View was already set by `applyRoute` before dispatch — do not re-route.
    } catch (error) {
      if (this.handleOfficerDenied(error)) {
        return;
      }
      this.errorMessage.set('No pudimos abrir el caso. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  backToQueue(): void {
    this.queueLoaded.set(false);
    this.navigate('queue');
  }

  // ─── Decisión (aprobar/rechazar/pedir info + nota) ──────────────────────────
  decide(outcome: DecisionOutcome): void {
    const kase = this.activeCase();
    if (!kase || isClosedStatus(kase.application.status) || this.loading()) {
      return;
    }
    void this.#decide(kase.application.id, outcome);
  }

  async #decide(caseId: string, outcome: DecisionOutcome): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const kase = await this.#api.decide(this.apiBase(), {
        caseId,
        outcome,
        note: this.decisionNote().trim(),
      });
      this.activeCase.set(kase);
      this.decisionNote.set('');
      this.queueLoaded.set(false); // queue must refetch to reflect the new status
      this.announce(`El caso pasó a: ${STATUS_LABELS[kase.application.status]}.`);
      this.casedecided.emit({ caseId, outcome });
    } catch (error) {
      // La sesión pudo expirar a mitad de la revisión, o perder el rol: mismo rebote.
      if (this.handleOfficerDenied(error)) {
        return;
      }
      this.errorMessage.set('No pudimos registrar la decisión. Intente de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Labels / helpers (lenguaje claro) ──────────────────────────────────────
  statusLabel(status: ApplicationStatus): string {
    return STATUS_LABELS[status];
  }

  statusHint(status: ApplicationStatus): string {
    return STATUS_HINTS[status];
  }

  outcomeLabel(outcome: DecisionOutcome): string {
    return OUTCOME_LABELS[outcome];
  }

  isClosed(status: ApplicationStatus): boolean {
    return isClosedStatus(status);
  }

  categoryLabel(category: string): string {
    return CATEGORIES.find((entry) => entry.key === category)?.label ?? category;
  }

  priorityLabel(priority: string): string {
    switch (priority) {
      case 'urgent':
        return 'Urgente';
      case 'high':
        return 'Alta';
      case 'low':
        return 'Baja';
      default:
        return 'Normal';
    }
  }

  slaLabel(daysLeft: number): string {
    if (daysLeft < 0) {
      return `Vencido hace ${Math.abs(daysLeft)} día(s)`;
    }
    if (daysLeft === 0) {
      return 'Vence hoy';
    }
    return daysLeft === 1 ? '1 día restante' : `${daysLeft} días restantes`;
  }

  feeLabel(feeMinor: number, currency: string): string {
    if (feeMinor <= 0) {
      return 'Gratuito';
    }
    return this.formatFee(feeMinor, currency);
  }

  // Divide los minor units por el factor REAL de la moneda: COP tiene 0 decimales
  // (1 minor = 1 peso), así 189000 → $189.000 y no $1.890. USD/EUR (2 decimales) → /100.
  formatFee(feeMinor: number, currency: string): string {
    return this.formatMoney(feeMinor / this.minorUnitFactor(currency), currency);
  }

  private minorUnitFactor(currency: string): number {
    try {
      const digits = new Intl.NumberFormat('es-CO', { style: 'currency', currency })
        .resolvedOptions().maximumFractionDigits ?? 2;
      return 10 ** digits;
    } catch {
      return 100;
    }
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
    const value = iso.length <= 10 ? `${iso}T00:00:00` : iso;
    try {
      return new Intl.DateTimeFormat('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(value));
    } catch {
      return iso;
    }
  }

  private announce(message: string): void {
    this.announcement.set(message);
  }
}
