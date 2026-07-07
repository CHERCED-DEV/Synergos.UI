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
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  CheckoutWizardComponent,
  ConsoleShellComponent,
  MessageCenterComponent,
  TrackingTimelineComponent,
  type AccountShellConfig,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  type MessageCenterConfig,
  type TrackingStage,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { EhrApiClient } from './ehr-api.client';
import { EHR_FLOW } from './ehr-fulfillment.strategy';
import {
  type Appointment,
  type BillingStatement,
  type ChartTab,
  type ClinicalAlert,
  type Doctor,
  type EhrPortal,
  type EhrRole,
  type EhrView,
  type Encounter,
  type EvolutionSeries,
  type HealthSummary,
  type HealthTab,
  type HomeCard,
  type InboxItem,
  type InboxKind,
  type KpiTile,
  type LabResult,
  type Medication,
  type MessageThread,
  type Patient,
  type PatientChart,
  type PortalHome,
  type Prescription,
  type PrescriptionItem,
  type RefillStatus,
  type ScheduleSlot,
  type SoapNote,
  type Vitals,
} from './ehr.model';

/**
 * Runtime config for the CMS element <c>elementSynEhr</c>.
 *
 * Healthcare **v2** — the two-portal clinical app (Epic MyChart + Hyperspace, doc 21
 * §2.5 + `deep-research/healthcare.md`) rebuilt as a **role-switch, hash-routed SPA**
 * (`#/ehr/...`) and the Ola-7 consumer of the reusable shell catalogue
 * `@synergos/shells`:
 *
 *  - **PACIENTE (portal MyChart-like):** home-feed · agendar/mis citas (SH-3 sobre
 *    el motor, copago apagable) + e-Check-In · mensajes con el equipo (SH-7) ·
 *    resultados de laboratorio (rango/flag) · medicamentos + refill · resumen de
 *    salud (condiciones/alergias/vacunas + timeline) · facturación (estado + plan).
 *  - **CLÍNICO (portal EHR-like, role-switch):** schedule board del día (estados) ·
 *    lista de pacientes · In Basket (SH-7 v3: resultados/refills/mensajes con
 *    routing) · chart del paciente (Storyboard + SOAP + órdenes/e-Rx + evolución) ·
 *    cerrar encuentro → AVS · cockpit KPIs (SH-5).
 *
 * 100% composable: no business is hardcoded; every knob comes from CMS props
 * (`apiBase`/`clinic`/`config` JSON, patrón createConfigInputTransform/
 * resolveConfigValue) and the data always comes from the API with visible mock
 * degradation. The shells stay domain-free (contrato D3) — the module only feeds
 * data, templates and its `EhrFulfillmentStrategy` (cita/copago).
 */
export interface EhrRuntimeConfig {
  /** Base URL of the EHR API. Default `/api/ehr`. */
  readonly apiBase?: string;
  /** Display name of the clinic shown in the shell header. Default `Clínica Synergos`. */
  readonly clinic?: string;
  /** Storage / instance scope (typically the siteRoot). Default `ehr`. */
  readonly scope?: string;
  /** Initial demo role. Default `patient`. */
  readonly role?: EhrRole;
  /** The patient the portal is scoped to (MyChart is single-patient). Default `P-1`. */
  readonly patient?: string;
  /** Copay in minor units charged when scheduling (0 = pago OFF). Default `0`. */
  readonly copayMinor?: number;
}

/** Typed event map for the transaction bus (ehr ↔ appointment ↔ refill ↔ order). */
interface EhrBus extends Record<string, unknown> {
  readonly appointmentbooked: { readonly appointmentId: string; readonly patientId: string };
  readonly refillrequested: { readonly medicationId: string; readonly patientId: string };
}

const DEFAULT_API_BASE = '/api/ehr';
const DEFAULT_CLINIC = 'Clínica Synergos';
const DEFAULT_SCOPE = 'ehr';
const DEFAULT_ROLE: EhrRole = 'patient';
const DEFAULT_PATIENT = 'P-1';
const DEFAULT_COPAY_MINOR = 0;
const SESSION_TTL_MS = 30 * 60 * 1000;

const ROLES: readonly { key: EhrRole; label: string; portal: EhrPortal }[] = [
  { key: 'patient', label: 'Paciente', portal: 'patient' },
  { key: 'doctor', label: 'Médico', portal: 'clinician' },
  { key: 'nurse', label: 'Enfermería', portal: 'clinician' },
];

/** Patient-portal nav (order = sidebar). */
const PATIENT_NAV: readonly { view: EhrView; label: string }[] = [
  { view: 'home', label: 'Inicio' },
  { view: 'visits', label: 'Mis citas' },
  { view: 'messages', label: 'Mensajes' },
  { view: 'results', label: 'Resultados' },
  { view: 'medications', label: 'Medicamentos' },
  { view: 'health', label: 'Mi salud' },
  { view: 'billing', label: 'Facturación' },
];

/** Clinician-portal nav (order = sidebar). */
const CLINICIAN_NAV: readonly { view: EhrView; label: string }[] = [
  { view: 'board', label: 'Agenda del día' },
  { view: 'patients', label: 'Pacientes' },
  { view: 'inbasket', label: 'In Basket' },
];

const PATIENT_VIEWS: readonly EhrView[] = [
  'home',
  'visits',
  'schedule',
  'echeckin',
  'messages',
  'results',
  'medications',
  'health',
  'billing',
];

const CLINICIAN_VIEWS: readonly EhrView[] = ['board', 'patients', 'inbasket', 'chart', 'encounter'];

/** The addressable sections inside the clinician SH-5 console. */
const BOARD_SECTIONS: readonly string[] = ['board', 'patients', 'inbasket'];

const EMPTY_VITALS: Vitals = {
  systolic: 0,
  diastolic: 0,
  heartRate: 0,
  temperature: 0,
  weight: 0,
  height: 0,
  glucose: 0,
};

const E_CHECKIN_STEPS = ['demografia', 'seguro', 'medicamentos', 'cuestionario', 'consentimiento'] as const;

function sanitizeConfig(value: Partial<EhrRuntimeConfig>): EhrRuntimeConfig {
  return omitUndefinedProperties<EhrRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    clinic: coerceTrimmedStringInput(value.clinic),
    scope: coerceTrimmedStringInput(value.scope),
    role: coerceRole(value.role),
    patient: coerceTrimmedStringInput(value.patient),
    copayMinor: coerceCopay(value.copayMinor),
  });
}

function coerceRole(value: unknown): EhrRole | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'patient' || raw === 'doctor' || raw === 'nurse' ? raw : undefined;
}

function coerceCopay(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : undefined;
  }
  return undefined;
}

function portalOf(role: EhrRole): EhrPortal {
  return role === 'patient' ? 'patient' : 'clinician';
}

let ehrInstanceId = 0;

@Component({
  selector: 'sg-ehr',
  standalone: true,
  imports: [
    AccountShellComponent,
    ConsoleShellComponent,
    MessageCenterComponent,
    CheckoutWizardComponent,
    TrackingTimelineComponent,
  ],
  templateUrl: './ehr.html',
  styleUrl: './ehr.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements may be hydrated by the CMS shell.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-ehr' },
})
export class EhrElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<EhrBus>>(TransactionEventBusService);
  readonly #api = inject(EhrApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<EhrRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<EhrRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly clinicInput = input<string | undefined>(undefined, { alias: 'clinic' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly patientInput = input<string | undefined>(undefined, { alias: 'patient' });
  readonly copayInput = input<string | number | undefined>(undefined, { alias: 'copayMinor' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly clinic = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.clinicInput()), this.config()?.clinic, DEFAULT_CLINIC),
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), this.config()?.scope, DEFAULT_SCOPE),
  );
  readonly initialRole = computed<EhrRole>(() =>
    resolveConfigValue(coerceRole(this.roleInput()), this.config()?.role, DEFAULT_ROLE),
  );
  readonly patientId = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.patientInput()), this.config()?.patient, DEFAULT_PATIENT),
  );
  readonly copayMinor = computed(() =>
    resolveConfigValue(coerceCopay(this.copayInput()), this.config()?.copayMinor, DEFAULT_COPAY_MINOR),
  );

  readonly instanceId = (ehrInstanceId += 1);
  readonly fieldId = `syn-ehr-${this.instanceId}`;
  readonly roles = ROLES;
  readonly patientNav = PATIENT_NAV;
  readonly clinicianNav = CLINICIAN_NAV;
  readonly checkinSteps = E_CHECKIN_STEPS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly viewchange = output<EhrView>();
  readonly rolechange = output<EhrRole>();
  readonly patientselect = output<string>();
  readonly appointmentbooked = output<{ appointmentId: string; patientId: string }>();
  readonly refillrequested = output<{ medicationId: string; patientId: string }>();
  readonly encountersaved = output<{ patientId: string; encounterId: string }>();

  // ─── Role / shell state ──────────────────────────────────────────────────────
  readonly role = signal<EhrRole>(DEFAULT_ROLE);
  readonly portal = computed<EhrPortal>(() => portalOf(this.role()));
  readonly view = signal<EhrView>('home');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly navOpen = signal(false);
  readonly liveConflict = this.#store.liveSessionConflict;
  #suppressedHash = '';
  /**
   * The patient identity the portal data was last loaded for. In Angular Elements
   * the `config`/`patient` attribute→input lands AFTER the constructor runs, so the
   * first `patientId()` read is the default (`P-1`). The identity `effect()` below
   * reacts once the real id arrives, invalidates the per-view `*Loaded` flags and
   * reloads the CURRENT view — so deep-links (`#/ehr/resultados`) rehydrate too.
   * Sentinel `''` means "nothing loaded yet" (never equals a resolved id).
   */
  #lastLoadedPatient = '';

  /** Only clinicians (doctor / nurse) may author encounters, e-Rx and release results. */
  readonly canClinicalWrite = computed(() => this.role() === 'doctor' || this.role() === 'nurse');

  // ─── PATIENT portal state ────────────────────────────────────────────────────
  readonly home = signal<PortalHome | null>(null);
  readonly homeLoaded = signal(false);

  readonly results = signal<readonly LabResult[]>([]);
  readonly resultsLoaded = signal(false);
  readonly activeResult = signal<LabResult | null>(null);

  readonly medications = signal<readonly Medication[]>([]);
  readonly medsLoaded = signal(false);

  readonly healthSummary = signal<HealthSummary | null>(null);
  readonly healthLoaded = signal(false);
  readonly healthTab = signal<HealthTab>('conditions');

  readonly billing = signal<BillingStatement | null>(null);
  readonly billingLoaded = signal(false);

  // e-Check-In wizard (form-stepper over a task-list)
  readonly checkinStep = signal(0);
  readonly checkinDone = signal(false);
  readonly checkinDemografia = signal(true);
  readonly checkinSeguro = signal(true);
  readonly checkinMeds = signal(true);
  readonly checkinConsent = signal(false);

  // My appointments (patient)
  readonly myAppointments = signal<readonly Appointment[]>([]);
  readonly appointmentsLoaded = signal(false);

  // ─── Scheduling (SH-3 over engine — copago apagable) ─────────────────────────
  readonly doctors = signal<readonly Doctor[]>([]);
  readonly doctorsLoaded = signal(false);
  readonly scheduleDoctorId = signal('');
  readonly scheduleDate = signal('');
  readonly scheduleTime = signal('');
  readonly scheduleReason = signal('');
  readonly scheduleMode = signal<'in-person' | 'video'>('in-person');
  readonly confirmedAppointmentRef = signal('');

  // ─── Messaging (SH-7, shared graph) ──────────────────────────────────────────
  readonly threads = signal<readonly MessageThread[]>([]);
  readonly threadsLoaded = signal(false);
  readonly activeThread = signal<MessageThread | null>(null);
  readonly sendingMessage = signal(false);

  // ─── CLINICIAN portal state ──────────────────────────────────────────────────
  readonly board = signal<readonly ScheduleSlot[]>([]);
  readonly boardLoaded = signal(false);
  readonly boardDate = signal(new Date().toISOString().slice(0, 10));

  readonly patients = signal<readonly Patient[]>([]);
  readonly patientsLoaded = signal(false);
  readonly patientQuery = signal('');

  readonly inbox = signal<readonly InboxItem[]>([]);
  readonly inboxLoaded = signal(false);
  readonly inboxFilter = signal<'all' | InboxKind>('all');
  readonly consoleSection = signal<string>('board');

  // Patient chart (clinician)
  readonly chart = signal<PatientChart | null>(null);
  readonly chartTab = signal<ChartTab>('summary');

  // Encounter (SOAP) draft
  readonly soapSubjective = signal('');
  readonly soapAssessment = signal('');
  readonly soapPlan = signal('');
  readonly soapSignature = signal('');
  readonly vitalsSystolic = signal('');
  readonly vitalsDiastolic = signal('');
  readonly vitalsHeartRate = signal('');
  readonly vitalsTemperature = signal('');
  readonly vitalsWeight = signal('');
  readonly vitalsHeight = signal('');
  readonly vitalsGlucose = signal('');

  // Order entry / e-Rx draft (inside the encounter)
  readonly rxItems = signal<readonly PrescriptionItem[]>([]);
  readonly rxDrug = signal('');
  readonly rxDose = signal('');
  readonly rxFrequency = signal('');
  readonly rxDuration = signal('');

  // Encounter close → AVS
  readonly closedAvs = signal('');

  // ─── Degradation flag (mock fallback surfaced to both portals) ───────────────
  readonly degraded = computed(() => {
    void this.homeLoaded();
    void this.resultsLoaded();
    void this.medsLoaded();
    void this.healthLoaded();
    void this.billingLoaded();
    void this.threadsLoaded();
    void this.boardLoaded();
    void this.patientsLoaded();
    void this.inboxLoaded();
    void this.chart();
    return this.#api.degraded;
  });

  // ─── Derived: results (grid + trend) ─────────────────────────────────────────
  readonly releasedResults = computed(() => this.results().filter((result) => result.released));

  // ─── Derived: chart evolution (SOAP objective series) ────────────────────────
  readonly latestVitals = computed<Vitals | null>(() => {
    const encounters = this.chart()?.encounters ?? [];
    return encounters.length > 0 ? encounters[0].soap.objective : null;
  });

  readonly evolutionSeries = computed<readonly EvolutionSeries[]>(() => {
    const encounters = [...(this.chart()?.encounters ?? [])].reverse();
    if (encounters.length === 0) {
      return [];
    }
    return [
      {
        key: 'systolic',
        label: 'Presión sistólica',
        unit: 'mmHg',
        points: encounters.map((e) => ({ date: e.date, value: e.soap.objective.systolic })),
      },
      {
        key: 'weight',
        label: 'Peso',
        unit: 'kg',
        points: encounters.map((e) => ({ date: e.date, value: e.soap.objective.weight })),
      },
      {
        key: 'glucose',
        label: 'Glucosa',
        unit: 'mg/dL',
        points: encounters.map((e) => ({ date: e.date, value: e.soap.objective.glucose })),
      },
    ];
  });

  // ─── Encounter validity + drug interactions ──────────────────────────────────
  readonly soapValid = computed(
    () => this.soapSubjective().trim().length > 3 && this.soapAssessment().trim().length > 3,
  );

  readonly rxItemValid = computed(
    () => this.rxDrug().trim().length > 1 && this.rxDose().trim().length > 0,
  );

  readonly rxInteractions = computed<readonly string[]>(() => {
    const chart = this.chart();
    if (!chart) {
      return [];
    }
    const allergies = chart.patient.allergies.map((allergy) => allergy.toLowerCase());
    const flags: string[] = [];
    for (const item of this.rxItems()) {
      const drug = item.drug.toLowerCase();
      for (const allergy of allergies) {
        if (drug.includes(allergy) || allergy.includes(drug)) {
          flags.push(`${item.drug}: posible reacción con alergia a ${allergy}.`);
        }
      }
    }
    return flags;
  });

  readonly scheduleValid = computed(
    () =>
      this.scheduleDoctorId().trim() !== '' &&
      this.scheduleDate().trim() !== '' &&
      this.scheduleTime().trim() !== '',
  );

  // ─── Clinician cockpit KPIs (SH-5) ───────────────────────────────────────────
  readonly kpis = computed<readonly KpiTile[]>(() => {
    const slots = this.board();
    const total = slots.length;
    const seen = slots.filter(
      (slot) => slot.state === 'roomed' || slot.state === 'in-visit' || slot.state === 'checked-out',
    ).length;
    const waiting = slots.filter((slot) => slot.state === 'arrived' || slot.state === 'scheduled').length;
    const noShow = slots.filter((slot) => slot.state === 'no-show').length;
    const pendingInbox = this.inbox().filter((item) => !item.done).length;
    return [
      { key: 'total', label: 'Citas de hoy', value: String(total), hint: `${waiting} en espera`, tone: 'brand' },
      { key: 'seen', label: 'Atendidos', value: String(seen), hint: `de ${total}`, tone: 'success' },
      {
        key: 'inbox',
        label: 'In Basket pendiente',
        value: String(pendingInbox),
        hint: 'tareas por resolver',
        tone: pendingInbox > 0 ? 'warning' : 'success',
      },
      {
        key: 'noshow',
        label: 'Inasistencias',
        value: String(noShow),
        hint: 'hoy',
        tone: noShow > 0 ? 'danger' : 'success',
      },
    ];
  });

  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() =>
    this.kpis().map((kpi) => ({
      id: kpi.key,
      label: kpi.label,
      value: kpi.value,
      hint: kpi.hint,
    })),
  );

  readonly storyboardAlerts = computed<readonly ClinicalAlert[]>(() => {
    const chart = this.chart();
    if (!chart) {
      return [];
    }
    const alerts: ClinicalAlert[] = [];
    for (const allergy of chart.patient.allergies) {
      alerts.push({ id: `allergy-${allergy}`, severity: 'warning', title: 'Alergia', detail: allergy });
    }
    for (const problem of chart.patient.problems) {
      alerts.push({ id: `problem-${problem}`, severity: 'info', title: 'Condición', detail: problem });
    }
    return alerts;
  });

  // ─── SH-5 console config (clinician cockpit) ─────────────────────────────────
  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Cockpit clínico',
    navLabel: 'Secciones del cockpit',
    kpisLabel: 'Indicadores del día',
    filtersLabel: 'Filtrar In Basket',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay filas en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      { id: 'board', label: 'Agenda del día', kind: 'table', badge: this.board().length || undefined },
      { id: 'patients', label: 'Pacientes', kind: 'table', badge: this.patients().length || undefined },
      { id: 'inbasket', label: 'In Basket', kind: 'table', badge: this.pendingInboxCount() || undefined },
    ],
  }));

  readonly pendingInboxCount = computed(() => this.inbox().filter((item) => !item.done).length);

  readonly boardColumns: readonly ConsoleColumn[] = [
    { key: 'time', label: 'Hora' },
    { key: 'patient', label: 'Paciente' },
    { key: 'reason', label: 'Motivo' },
    { key: 'type', label: 'Tipo' },
    { key: 'state', label: 'Estado' },
  ];

  readonly patientColumns: readonly ConsoleColumn[] = [
    { key: 'name', label: 'Paciente' },
    { key: 'document', label: 'Documento' },
    { key: 'age', label: 'Edad', align: 'end' },
    { key: 'problems', label: 'Condiciones' },
    { key: 'flags', label: 'Alertas' },
  ];

  readonly inboxColumns: readonly ConsoleColumn[] = [
    { key: 'kind', label: 'Tipo' },
    { key: 'patient', label: 'Paciente' },
    { key: 'title', label: 'Asunto' },
    { key: 'priority', label: 'Prioridad' },
  ];

  readonly boardActions: readonly ConsoleRowAction[] = [
    { id: 'open-chart', label: 'Abrir chart', kind: 'primary' },
    { id: 'advance', label: 'Avanzar', kind: 'default' },
  ];
  readonly patientActions: readonly ConsoleRowAction[] = [{ id: 'open-chart', label: 'Abrir chart', kind: 'primary' }];
  readonly inboxActions: readonly ConsoleRowAction[] = [
    { id: 'open', label: 'Abrir', kind: 'default' },
    { id: 'resolve', label: 'Resolver', kind: 'primary' },
  ];

  readonly filteredInbox = computed<readonly InboxItem[]>(() => {
    const filter = this.inboxFilter();
    const list = this.inbox();
    return filter === 'all' ? list : list.filter((item) => item.kind === filter);
  });

  /** Union row type so the generic SH-5 console unifies `TRow` across sections. */
  readonly consoleRows = computed<readonly (ScheduleSlot | Patient | InboxItem)[]>(() => {
    switch (this.consoleSection()) {
      case 'patients':
        return this.patients();
      case 'inbasket':
        return this.filteredInbox();
      default:
        return this.board();
    }
  });

  readonly consoleColumns = computed<readonly ConsoleColumn[]>(() => {
    switch (this.consoleSection()) {
      case 'patients':
        return this.patientColumns;
      case 'inbasket':
        return this.inboxColumns;
      default:
        return this.boardColumns;
    }
  });

  readonly consoleActions = computed<readonly ConsoleRowAction[]>(() => {
    switch (this.consoleSection()) {
      case 'patients':
        return this.patientActions;
      case 'inbasket':
        return this.inboxActions;
      default:
        return this.boardActions;
    }
  });

  readonly consoleFilters = computed(() =>
    this.consoleSection() === 'inbasket'
      ? [
          { key: 'all', label: 'Todos' },
          { key: 'result', label: 'Resultados' },
          { key: 'refill', label: 'Renovaciones' },
          { key: 'advice', label: 'Consultas' },
          { key: 'cosign', label: 'Cofirmas' },
        ]
      : [],
  );

  // ─── SH-4 account config (patient "mis citas") ───────────────────────────────
  readonly visitsConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mis citas',
    navLabel: 'Secciones de citas',
    inboxEmptyMessage: 'No tienes citas registradas todavía.',
    inboxLoadingMessage: 'Cargando tus citas…',
    detailPlaceholder: 'Selecciona una cita para ver el detalle y su seguimiento.',
    sections: [
      { id: 'upcoming', label: 'Próximas y pasadas', kind: 'inbox', badge: this.myAppointments().length || undefined },
      { id: 'schedule', label: 'Agendar cita' },
    ],
  }));

  readonly visitsSection = signal<'upcoming' | 'schedule'>('upcoming');

  // ─── SH-7 message config ─────────────────────────────────────────────────────
  readonly messageConfig = computed<MessageCenterConfig>(() => ({
    heading: this.portal() === 'patient' ? 'Mensajes con tu equipo de salud' : 'Mensajes del paciente',
    listLabel: 'Conversaciones',
    emptyMessage: 'No tienes conversaciones todavía.',
    loadingMessage: 'Cargando conversaciones…',
    detailPlaceholder: 'Selecciona una conversación para ver el hilo.',
    composerPlaceholder: 'Escribe un mensaje seguro…',
    sendLabel: 'Enviar',
    sendingLabel: 'Enviando…',
  }));

  // ─── SH-3 schedule checkout config (copago apagable) ─────────────────────────
  readonly scheduleConfig = computed<CheckoutWizardConfig>(() => {
    const steps = [
      { id: 'proveedor', label: 'Motivo y médico' },
      { id: 'slot', label: 'Fecha y hora' },
    ];
    if (this.copayMinor() > 0) {
      steps.push({ id: 'copago', label: 'Copago' });
    }
    steps.push({ id: 'confirmar', label: 'Confirmar' });
    return {
      steps,
      stepsLabel: 'Pasos para agendar la cita',
      summaryHeading: 'Tu cita',
      submitLabel: 'Confirmar cita',
      processingLabel: 'Agendando…',
      nextLabel: 'Continuar',
      backLabel: 'Atrás',
      totalLabel: this.copayMinor() > 0 ? 'Copago' : 'Sin costo',
    };
  });

  readonly scheduleValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    proveedor: this.scheduleDoctorId().trim() !== '' && this.scheduleReason().trim().length >= 3,
    slot: this.scheduleValid(),
    copago: true,
    confirmar: this.scheduleValid(),
  }));

  readonly scheduleInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    provider: 'ehr-appointment',
    patientId: this.patientId(),
    doctorId: this.scheduleDoctorId(),
  }));

  constructor() {
    const initialRole = this.initialRole();
    this.role.set(initialRole);
    this.view.set(portalOf(initialRole) === 'patient' ? 'home' : 'board');

    // Bind the unified session (appointment hold) to this origin and rehydrate.
    this.#store.init({
      scope: `ehr.${this.instanceId}`,
      flow: EHR_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: 'COP',
    });
    this.#bus.scope(`ehr-${this.instanceId}`);

    const widget = this.#orchestrator.register('ehr-portal', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/resultados, #/<scope>/chart/<id>…).
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

    // Resolve the initial route from the hash (deep-link) BEFORE any data loads so
    // the identity effect reloads the RIGHT view (not just home).
    this.applyHash();

    // Identity effect: reacts to the resolved `patientId()`. In Angular Elements the
    // real id lands AFTER construction, so this fires first with the default and then
    // again with the CMS-supplied id (`config.patient`), re-fetching against the true
    // identity. Guarded by `#lastLoadedPatient` so it never loops or re-loads when the
    // id is unchanged (e.g. an unrelated signal read elsewhere).
    effect(() => {
      const patient = this.patientId();
      if (patient === this.#lastLoadedPatient) {
        return;
      }
      this.#lastLoadedPatient = patient;
      // Only `patientId()` is a dependency — the reload reads/writes many other
      // signals, so keep them out of this effect's dependency graph.
      untracked(() => this.reloadForIdentity());
    });
  }

  /**
   * Invalidate every patient-scoped `*Loaded` flag and reload the CURRENT view for the
   * resolved identity. Clinician board data (patients/schedule/inbox from the provider,
   * not the patient scope) is only reset when we're actually in the clinician portal.
   */
  private reloadForIdentity(): void {
    // Fresh round for the new identity: clear the degradation latch so a stale
    // first-tick default 404 does not keep the "datos de ejemplo" banner up once the
    // real `config.patient` data lands (the flag re-latches only if THIS load degrades).
    this.#api.resetDegraded();
    // Patient-scoped caches — always stale when the identity changes.
    this.homeLoaded.set(false);
    this.appointmentsLoaded.set(false);
    this.resultsLoaded.set(false);
    this.medsLoaded.set(false);
    this.healthLoaded.set(false);
    this.billingLoaded.set(false);
    this.threadsLoaded.set(false);
    this.home.set(null);
    this.activeResult.set(null);
    this.activeThread.set(null);
    if (this.portal() === 'clinician') {
      // Provider-scoped caches (schedule/patients/inbox) — refresh the cockpit too.
      this.boardLoaded.set(false);
      this.patientsLoaded.set(false);
      this.inboxLoaded.set(false);
    }
    // Reload whatever view is currently active (respects deep-links + dispatch by view).
    this.applyRoute(this.view(), this.chart()?.patient.id ?? '');
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) =>
      setter((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '');
  }

  // ─── Role switch (portal switch) ─────────────────────────────────────────────
  setRole(role: EhrRole): void {
    if (this.role() === role) {
      return;
    }
    const wasClinician = this.portal() === 'clinician';
    this.role.set(role);
    this.errorMessage.set('');
    this.navOpen.set(false);
    this.rolechange.emit(role);
    if (portalOf(role) === 'clinician') {
      if (!this.boardLoaded()) {
        void this.loadBoard();
      }
      this.navigate('board');
    } else {
      if (!this.homeLoaded()) {
        void this.loadHome();
      }
      this.navigate('home');
    }
    void wasClinician;
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  // ─── Router (signals + hash deep-links) ──────────────────────────────────────
  navigate(view: EhrView, param = ''): void {
    this.applyRoute(view, param);
    this.writeHash(view, param);
    this.navOpen.set(false);
  }

  go(view: EhrView): void {
    this.navigate(view);
  }

  private applyRoute(view: EhrView, param: string): void {
    this.view.set(view);
    this.errorMessage.set('');
    this.viewchange.emit(view);
    switch (view) {
      case 'home':
        if (!this.homeLoaded()) {
          void this.loadHome();
        }
        return;
      case 'visits':
        this.visitsSection.set('upcoming');
        if (!this.appointmentsLoaded()) {
          void this.loadMyAppointments();
        }
        return;
      case 'schedule':
        void this.ensureDoctors();
        this.#store.reset();
        return;
      case 'results':
        if (!this.resultsLoaded()) {
          void this.loadResults();
        }
        return;
      case 'medications':
        if (!this.medsLoaded()) {
          void this.loadMedications();
        }
        return;
      case 'health':
        this.healthTab.set('conditions');
        if (!this.healthLoaded()) {
          void this.loadHealth();
        }
        return;
      case 'billing':
        if (!this.billingLoaded()) {
          void this.loadBilling();
        }
        return;
      case 'messages':
        if (!this.threadsLoaded()) {
          void this.loadThreads();
        }
        return;
      case 'board':
        this.consoleSection.set('board');
        if (!this.boardLoaded()) {
          void this.loadBoard();
        }
        return;
      case 'patients':
        this.consoleSection.set('patients');
        if (!this.patientsLoaded()) {
          void this.loadPatients();
        }
        return;
      case 'inbasket':
        this.consoleSection.set('inbasket');
        if (!this.inboxLoaded()) {
          void this.loadInbox();
        }
        return;
      case 'chart':
        if (param) {
          void this.loadChart(param);
        }
        return;
      default:
        return;
    }
  }

  private routeHash(view: EhrView, param: string): string {
    const base = `#/${this.scope()}`;
    switch (view) {
      case 'home':
        return base;
      case 'visits':
        return `${base}/citas`;
      case 'schedule':
        return `${base}/agendar`;
      case 'echeckin':
        return `${base}/echeckin`;
      case 'messages':
        return `${base}/mensajes`;
      case 'results':
        return `${base}/resultados`;
      case 'medications':
        return `${base}/medicamentos`;
      case 'health':
        return `${base}/salud`;
      case 'billing':
        return `${base}/facturacion`;
      case 'board':
        return `${base}/agenda`;
      case 'patients':
        return `${base}/pacientes`;
      case 'inbasket':
        return `${base}/inbasket`;
      case 'chart':
        return `${base}/chart/${encodeURIComponent(param)}`;
      case 'encounter':
        return `${base}/encuentro`;
      default:
        return base;
    }
  }

  private writeHash(view: EhrView, param: string): void {
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
    const [head = '', tail = ''] = segments;
    const map: Readonly<Record<string, EhrView>> = {
      '': 'home',
      citas: 'visits',
      agendar: 'schedule',
      echeckin: 'echeckin',
      mensajes: 'messages',
      resultados: 'results',
      medicamentos: 'medications',
      salud: 'health',
      facturacion: 'billing',
      agenda: 'board',
      pacientes: 'patients',
      inbasket: 'inbasket',
      encuentro: 'encounter',
    };
    if (head === 'chart') {
      this.ensureClinicianRole();
      this.applyRoute('chart', decodeURIComponent(tail));
      return;
    }
    const target = map[head];
    if (!target) {
      this.applyRoute(this.portal() === 'patient' ? 'home' : 'board', '');
      return;
    }
    // Keep the role aligned with the portal the target view belongs to.
    if ((CLINICIAN_VIEWS as readonly string[]).includes(target)) {
      this.ensureClinicianRole();
    } else if ((PATIENT_VIEWS as readonly string[]).includes(target) && this.portal() !== 'patient') {
      this.role.set('patient');
    }
    this.applyRoute(target, tail);
  }

  private ensureClinicianRole(): void {
    if (this.portal() !== 'clinician') {
      this.role.set('doctor');
    }
  }

  // ─── PATIENT · home feed ─────────────────────────────────────────────────────
  private async loadHome(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const home = await this.#orchestrator.callApi(`home:${this.patientId()}`, () =>
        this.#api.portalHome(this.apiBase(), this.patientId()),
      );
      this.home.set(home);
      this.homeLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tu portal. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  openCard(card: HomeCard): void {
    if (card.action) {
      this.navigate(card.action as EhrView);
    }
  }

  // ─── PATIENT · my appointments ───────────────────────────────────────────────
  private async loadMyAppointments(): Promise<void> {
    this.loading.set(true);
    try {
      const home = this.home() ?? (await this.#api.portalHome(this.apiBase(), this.patientId()));
      const list: Appointment[] = [];
      if (home.nextAppointment) {
        list.push(home.nextAppointment);
      }
      // Reuse the appointments endpoint for the patient's history (scoped client-side).
      const appts = await this.#api.appointments(this.apiBase(), new Date().toISOString().slice(0, 10));
      for (const appt of appts) {
        if (appt.patientId === this.patientId() && !list.some((entry) => entry.id === appt.id)) {
          list.push(appt);
        }
      }
      this.myAppointments.set(list);
      this.appointmentsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus citas.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  onVisitsSectionChange(sectionId: string): void {
    if (sectionId === 'upcoming' || sectionId === 'schedule') {
      this.visitsSection.set(sectionId);
      if (sectionId === 'schedule') {
        this.navigate('schedule');
      }
    }
  }

  appointmentTracking(appointment: Appointment): readonly TrackingStage[] {
    return [
      { id: 'booked', label: 'Cita agendada', date: this.formatDate(appointment.date), state: 'done' },
      {
        id: 'checkin',
        label: 'e-Check-In',
        state: appointment.status === 'checked-in' || appointment.status === 'in-progress' || appointment.status === 'done' ? 'done' : 'pending',
      },
      {
        id: 'seen',
        label: 'Atención médica',
        state: appointment.status === 'done' ? 'done' : appointment.status === 'in-progress' ? 'current' : 'pending',
      },
    ];
  }

  // ─── PATIENT · e-Check-In wizard ─────────────────────────────────────────────
  startCheckin(): void {
    this.checkinStep.set(0);
    this.checkinDone.set(false);
    this.checkinConsent.set(false);
    this.navigate('echeckin');
  }

  nextCheckinStep(): void {
    if (this.checkinStep() < E_CHECKIN_STEPS.length - 1) {
      this.checkinStep.update((step) => step + 1);
    } else if (this.checkinConsent()) {
      this.checkinDone.set(true);
    }
  }

  prevCheckinStep(): void {
    if (this.checkinStep() > 0) {
      this.checkinStep.update((step) => step - 1);
    } else {
      this.navigate('home');
    }
  }

  toggleCheckin(field: 'demografia' | 'seguro' | 'medicamentos' | 'consent'): void {
    switch (field) {
      case 'demografia':
        this.checkinDemografia.update((v) => !v);
        return;
      case 'seguro':
        this.checkinSeguro.update((v) => !v);
        return;
      case 'medicamentos':
        this.checkinMeds.update((v) => !v);
        return;
      case 'consent':
        this.checkinConsent.update((v) => !v);
        return;
    }
  }

  // ─── PATIENT · results ───────────────────────────────────────────────────────
  private async loadResults(): Promise<void> {
    this.loading.set(true);
    try {
      const results = await this.#api.results(this.apiBase(), this.patientId());
      this.results.set(results);
      this.resultsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus resultados.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  openResult(result: LabResult): void {
    this.activeResult.set(this.activeResult()?.id === result.id ? null : result);
  }

  resultFlagLabel(flag: LabResult['flag']): string {
    switch (flag) {
      case 'high':
        return 'Alto';
      case 'low':
        return 'Bajo';
      case 'critical':
        return 'Crítico';
      default:
        return 'Normal';
    }
  }

  /** Bar position % of a value inside its reference range (result gauge). */
  resultGaugePct(result: LabResult): number {
    const span = result.refHigh - result.refLow || 1;
    const pct = ((result.value - result.refLow) / span) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  // ─── PATIENT · medications + refill ──────────────────────────────────────────
  private async loadMedications(): Promise<void> {
    this.loading.set(true);
    try {
      const meds = await this.#api.medications(this.apiBase(), this.patientId());
      this.medications.set(meds);
      this.medsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus medicamentos.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  requestRefill(medication: Medication): void {
    if (medication.refillStatus === 'requested') {
      return;
    }
    // Optimistic: mark requested immediately, then reconcile with the server.
    this.patchMedication(medication.id, (med) => ({ ...med, refillStatus: 'requested' as RefillStatus }));
    const payload = { medicationId: medication.id, patientId: this.patientId() };
    this.refillrequested.emit(payload);
    this.#bus.publish('refillrequested', payload);
    void this.#api
      .requestRefill(this.apiBase(), payload, 'requested')
      .then((status) => this.patchMedication(medication.id, (med) => ({ ...med, refillStatus: status })));
  }

  private patchMedication(id: string, patch: (med: Medication) => Medication): void {
    this.medications.update((list) => list.map((med) => (med.id === id ? patch(med) : med)));
  }

  refillStatusLabel(status: RefillStatus | null): string {
    switch (status) {
      case 'requested':
        return 'Solicitada';
      case 'approved':
        return 'Aprobada';
      case 'denied':
        return 'Rechazada';
      default:
        return '';
    }
  }

  // ─── PATIENT · health summary ────────────────────────────────────────────────
  private async loadHealth(): Promise<void> {
    this.loading.set(true);
    try {
      const summary = await this.#api.healthSummary(this.apiBase(), this.patientId());
      this.healthSummary.set(summary);
      this.healthLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tu resumen de salud.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  setHealthTab(tab: HealthTab): void {
    this.healthTab.set(tab);
  }

  /** Timeline stages from the immunization record (SH-4 tracking-timeline reuse). */
  readonly immunizationStages = computed<readonly TrackingStage[]>(() =>
    (this.healthSummary()?.immunizations ?? []).map((imm) => ({
      id: imm.id,
      label: imm.name,
      date: imm.date ? this.formatDate(imm.date) : undefined,
      description:
        imm.status === 'complete' ? 'Aplicada' : imm.status === 'due' ? 'Pendiente' : 'Vencida',
      state: imm.status === 'complete' ? ('done' as const) : imm.status === 'due' ? ('current' as const) : ('pending' as const),
    })),
  );

  // ─── PATIENT · billing ───────────────────────────────────────────────────────
  private async loadBilling(): Promise<void> {
    this.loading.set(true);
    try {
      const statement = await this.#api.billing(this.apiBase(), this.patientId());
      this.billing.set(statement);
      this.billingLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tu facturación.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  startPaymentPlan(): void {
    this.billing.update((statement) => (statement ? { ...statement, planActive: true } : statement));
  }

  // ─── Scheduling (SH-3 over engine — copago apagable) ─────────────────────────
  private async ensureDoctors(): Promise<void> {
    if (this.doctorsLoaded()) {
      return;
    }
    try {
      const doctors = await this.#api.doctors(this.apiBase());
      this.doctors.set(doctors);
      this.doctorsLoaded.set(true);
      if (!this.scheduleDoctorId() && doctors[0]) {
        this.scheduleDoctorId.set(doctors[0].id);
      }
    } catch (error) {
      void error;
    }
  }

  /** Demo availability: next 7 days × 4 daily windows. */
  readonly availableSlots = computed<readonly { date: string; time: string }[]>(() => {
    const slots: { date: string; time: string }[] = [];
    const times = ['08:00', '10:00', '14:00', '16:00'];
    const today = new Date();
    for (let day = 1; day <= 7; day += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + day);
      const iso = date.toISOString().slice(0, 10);
      for (const time of times) {
        slots.push({ date: iso, time });
      }
    }
    return slots;
  });

  readonly availableDays = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    for (const slot of this.availableSlots()) {
      seen.add(slot.date);
    }
    return [...seen];
  });

  slotsForDay(date: string): readonly { date: string; time: string }[] {
    return this.availableSlots().filter((slot) => slot.date === date);
  }

  selectSlot(slot: { date: string; time: string }): void {
    this.scheduleDate.set(slot.date);
    this.scheduleTime.set(slot.time);
  }

  isSlotSelected(slot: { date: string; time: string }): boolean {
    return this.scheduleDate() === slot.date && this.scheduleTime() === slot.time;
  }

  setScheduleDoctor(id: string): void {
    this.scheduleDoctorId.set(id);
  }

  setScheduleMode(mode: 'in-person' | 'video'): void {
    this.scheduleMode.set(mode);
  }

  onScheduleStepChange(stepId: string): void {
    if ((stepId === 'copago' || stepId === 'confirmar') && this.scheduleValid()) {
      void this.selectAppointmentIntoCart();
    }
  }

  private async selectAppointmentIntoCart(): Promise<void> {
    const doctor = this.doctors().find((entry) => entry.id === this.scheduleDoctorId());
    const session = this.#store.getValidSession();
    const selection = await this.#fulfillment.select(
      {
        productRef: this.scheduleDoctorId(),
        kind: 'appointment',
        label: doctor?.name ?? 'Cita',
        amount: this.copayMinor(),
        selection: {
          patientId: this.patientId(),
          patientName: this.home()?.patient.name ?? 'Paciente',
          doctorId: this.scheduleDoctorId(),
          doctorName: doctor?.name ?? 'Médico',
          slot: { date: this.scheduleDate(), time: this.scheduleTime() },
          reason: this.scheduleReason().trim() || 'Consulta',
          mode: this.scheduleMode(),
          copayMinor: this.copayMinor(),
        },
      },
      session,
    );
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.#store.setPricing({
      currency: 'COP',
      totalAmount: this.copayMinor(),
      balanceDue: this.copayMinor(),
      breakdown:
        this.copayMinor() > 0
          ? [{ code: 'copay', label: 'Copago de la cita', amount: this.copayMinor() }]
          : [],
    });
  }

  onScheduleCompleted(result: CheckoutWizardResult): void {
    const voucher = result.vouchers[0];
    const detail = voucher?.detail ?? {};
    this.confirmedAppointmentRef.set(result.reference);
    const appointment: Appointment = {
      id: voucher?.reference ?? result.reference,
      patientId: this.patientId(),
      patientName: this.home()?.patient.name ?? 'Paciente',
      doctorId: this.scheduleDoctorId(),
      doctorName: typeof detail['doctorName'] === 'string' ? detail['doctorName'] : '',
      date: this.scheduleDate(),
      time: this.scheduleTime(),
      durationMin: 30,
      reason: this.scheduleReason().trim() || 'Consulta',
      status: 'booked',
    };
    this.myAppointments.update((list) => [appointment, ...list]);
    this.appointmentsLoaded.set(true);
    this.#store.reset();
    const payload = { appointmentId: appointment.id, patientId: appointment.patientId };
    this.appointmentbooked.emit(payload);
    this.#bus.publish('appointmentbooked', payload);
    this.visitsSection.set('upcoming');
    this.navigate('visits');
  }

  onScheduleFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos agendar la cita. Intenta de nuevo.');
  }

  onScheduleExit(): void {
    this.navigate('visits');
  }

  // ─── Messaging (SH-7) ────────────────────────────────────────────────────────
  private async loadThreads(): Promise<void> {
    this.loading.set(true);
    try {
      const user = this.portal() === 'patient' ? this.patientId() : this.role();
      const threads = await this.#api.messages(this.apiBase(), user);
      this.threads.set(threads);
      this.threadsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus mensajes.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  onThreadSelect(thread: MessageThread): void {
    this.threads.update((list) =>
      list.map((entry) => (entry.id === thread.id ? { ...entry, unread: 0 } : entry)),
    );
    this.activeThread.set({ ...thread, unread: 0 });
  }

  onSendMessage(event: { thread: MessageThread; body: string }): void {
    const body = event.body.trim();
    if (!body || this.sendingMessage()) {
      return;
    }
    const threadId = event.thread.id;
    const local = {
      id: `local-m-${Date.now().toString(36)}`,
      threadId,
      author: this.portal() === 'patient' ? 'Tú' : this.role() === 'doctor' ? 'Médico' : 'Enfermería',
      body,
      createdAtUtc: new Date().toISOString(),
      outgoing: true,
    };
    this.patchThread(threadId, (thread) => ({
      ...thread,
      messages: [...thread.messages, local],
      lastMessage: body,
      lastAtUtc: local.createdAtUtc,
    }));
    this.sendingMessage.set(true);
    void this.#api
      .sendMessage(this.apiBase(), { threadId, body, user: this.patientId() })
      .finally(() => this.sendingMessage.set(false));
  }

  private patchThread(id: string, patch: (thread: MessageThread) => MessageThread): void {
    this.threads.update((list) => list.map((thread) => (thread.id === id ? patch(thread) : thread)));
    const active = this.activeThread();
    if (active?.id === id) {
      this.activeThread.set(patch(active));
    }
  }

  // ─── CLINICIAN · schedule board ──────────────────────────────────────────────
  private async loadBoard(): Promise<void> {
    this.loading.set(true);
    try {
      const [board, patients, inbox] = await Promise.all([
        this.#orchestrator.callApi(`board:${this.boardDate()}`, () =>
          this.#api.schedule(this.apiBase(), this.boardDate()),
        ),
        this.#api.patients(this.apiBase(), ''),
        this.#api.inbox(this.apiBase(), this.role()),
      ]);
      this.board.set(board);
      this.boardLoaded.set(true);
      this.patients.set(patients);
      this.patientsLoaded.set(true);
      this.inbox.set(inbox);
      this.inboxLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar la agenda del día.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  advanceSlot(slot: ScheduleSlot): void {
    const order: readonly ScheduleSlot['state'][] = ['scheduled', 'arrived', 'roomed', 'in-visit', 'checked-out'];
    const idx = order.indexOf(slot.state);
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : slot.state;
    this.board.update((list) =>
      list.map((entry) => (entry.appointmentId === slot.appointmentId ? { ...entry, state: next } : entry)),
    );
  }

  scheduleStateLabel(state: ScheduleSlot['state']): string {
    switch (state) {
      case 'scheduled':
        return 'Agendado';
      case 'arrived':
        return 'En recepción';
      case 'roomed':
        return 'En consultorio';
      case 'in-visit':
        return 'En consulta';
      case 'checked-out':
        return 'Atendido';
      case 'no-show':
        return 'No asistió';
    }
  }

  scheduleStateTone(state: ScheduleSlot['state']): string {
    switch (state) {
      case 'checked-out':
      case 'in-visit':
      case 'roomed':
        return 'success';
      case 'no-show':
        return 'danger';
      case 'arrived':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  // ─── CLINICIAN · patient list ────────────────────────────────────────────────
  private async loadPatients(): Promise<void> {
    this.loading.set(true);
    try {
      const patients = await this.#api.patients(this.apiBase(), this.patientQuery());
      this.patients.set(patients);
      this.patientsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los pacientes.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  submitPatientSearch(): void {
    void this.loadPatients();
  }

  // ─── CLINICIAN · In Basket ───────────────────────────────────────────────────
  private async loadInbox(): Promise<void> {
    this.loading.set(true);
    try {
      const inbox = await this.#api.inbox(this.apiBase(), this.role());
      this.inbox.set(inbox);
      this.inboxLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el In Basket.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  resolveInboxItem(item: InboxItem): void {
    this.inbox.update((list) =>
      list.map((entry) => (entry.id === item.id ? { ...entry, done: true } : entry)),
    );
    // A refill approval routes back to the patient's Medications; a result release
    // routes to the portal — the cross-portal loop (demo: reflected locally).
    if (item.kind === 'refill') {
      this.patchMedication(item.id, (med) => ({ ...med, refillStatus: 'approved' }));
    }
  }

  openInboxItem(item: InboxItem): void {
    this.navigate('chart', item.patientId);
  }

  inboxKindLabel(kind: InboxKind): string {
    switch (kind) {
      case 'result':
        return 'Resultado';
      case 'refill':
        return 'Renovación';
      case 'advice':
        return 'Consulta';
      case 'cosign':
        return 'Cofirma';
    }
  }

  // ─── CLINICIAN · console shell wiring (SH-5) ─────────────────────────────────
  onConsoleSectionChange(sectionId: string): void {
    if (!(BOARD_SECTIONS as readonly string[]).includes(sectionId)) {
      return;
    }
    this.consoleSection.set(sectionId);
    if (sectionId === 'board') {
      this.navigate('board');
    } else if (sectionId === 'patients') {
      this.navigate('patients');
      if (!this.patientsLoaded()) {
        void this.loadPatients();
      }
    } else {
      this.navigate('inbasket');
      if (!this.inboxLoaded()) {
        void this.loadInbox();
      }
    }
  }

  onConsoleFilterChange(key: string): void {
    this.inboxFilter.set(key === 'all' ? 'all' : (key as InboxKind));
  }

  onConsoleAction(event: ConsoleRowActionEvent<ScheduleSlot | Patient | InboxItem>): void {
    const { sectionId, actionId, row } = event;
    if (sectionId === 'board') {
      const slot = row as ScheduleSlot;
      if (actionId === 'open-chart') {
        this.navigate('chart', slot.patientId);
      } else if (actionId === 'advance') {
        this.advanceSlot(slot);
      }
      return;
    }
    if (sectionId === 'patients') {
      const patient = row as Patient;
      if (actionId === 'open-chart') {
        this.navigate('chart', patient.id);
      }
      return;
    }
    if (sectionId === 'inbasket') {
      const item = row as InboxItem;
      if (actionId === 'open') {
        this.openInboxItem(item);
      } else if (actionId === 'resolve') {
        this.resolveInboxItem(item);
      }
    }
  }

  // ─── CLINICIAN · patient chart workspace ─────────────────────────────────────
  private async loadChart(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const chart = await this.#api.patientChart(this.apiBase(), id);
      this.chart.set(chart);
      this.chartTab.set('summary');
      this.view.set('chart');
      this.patientselect.emit(id);
      this.viewchange.emit('chart');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir la ficha del paciente.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  setChartTab(tab: ChartTab): void {
    this.chartTab.set(tab);
  }

  backToBoard(): void {
    this.chart.set(null);
    this.navigate('board');
  }

  // ─── CLINICIAN · encounter (SOAP + orders/e-Rx) ──────────────────────────────
  startEncounter(): void {
    if (!this.chart() || !this.canClinicalWrite()) {
      return;
    }
    this.resetEncounterDraft();
    this.closedAvs.set('');
    this.view.set('encounter');
    this.viewchange.emit('encounter');
  }

  cancelEncounter(): void {
    this.view.set('chart');
    this.chartTab.set('summary');
    this.errorMessage.set('');
    this.viewchange.emit('chart');
  }

  private resetEncounterDraft(): void {
    this.soapSubjective.set('');
    this.soapAssessment.set('');
    this.soapPlan.set('');
    this.soapSignature.set('');
    this.vitalsSystolic.set('');
    this.vitalsDiastolic.set('');
    this.vitalsHeartRate.set('');
    this.vitalsTemperature.set('');
    this.vitalsWeight.set('');
    this.vitalsHeight.set('');
    this.vitalsGlucose.set('');
    this.rxItems.set([]);
    this.rxDrug.set('');
    this.rxDose.set('');
    this.rxFrequency.set('');
    this.rxDuration.set('');
  }

  addRxItem(): void {
    if (!this.rxItemValid()) {
      return;
    }
    const item: PrescriptionItem = {
      drug: this.rxDrug().trim(),
      dose: this.rxDose().trim(),
      frequency: this.rxFrequency().trim() || 'Según indicación',
      durationDays: Math.max(0, this.toNumber(this.rxDuration())),
    };
    this.rxItems.update((items) => [...items, item]);
    this.rxDrug.set('');
    this.rxDose.set('');
    this.rxFrequency.set('');
    this.rxDuration.set('');
  }

  removeRxItem(index: number): void {
    this.rxItems.update((items) => items.filter((_, position) => position !== index));
  }

  private collectVitals(): Vitals {
    return {
      systolic: this.toNumber(this.vitalsSystolic()),
      diastolic: this.toNumber(this.vitalsDiastolic()),
      heartRate: this.toNumber(this.vitalsHeartRate()),
      temperature: this.toNumber(this.vitalsTemperature()),
      weight: this.toNumber(this.vitalsWeight()),
      height: this.toNumber(this.vitalsHeight()),
      glucose: this.toNumber(this.vitalsGlucose()),
    };
  }

  async saveEncounter(): Promise<void> {
    const chart = this.chart();
    if (!chart || !this.soapValid() || !this.canClinicalWrite() || this.loading()) {
      return;
    }
    const soap: SoapNote = {
      subjective: this.soapSubjective().trim(),
      objective: this.collectVitals(),
      assessment: this.soapAssessment().trim(),
      plan: this.soapPlan().trim(),
    };
    const patientId = chart.patient.id;
    const optimistic: Encounter = {
      id: `${patientId}-E-${Date.now().toString(36)}`,
      patientId,
      doctorId: chart.patient.primaryDoctorId,
      doctorName: this.doctorName(chart.patient.primaryDoctorId),
      date: new Date().toISOString().slice(0, 10),
      reason: this.soapAssessment().trim() || 'Consulta',
      soap,
      signature: this.soapSignature().trim(),
    };
    this.applyEncounter(chart, optimistic);
    this.loading.set(true);
    try {
      const saved = await this.#api.saveEncounter(this.apiBase(), { patientId, soap }, optimistic);
      this.replaceEncounter(optimistic.id, saved);
      if (this.rxItems().length > 0) {
        await this.persistPrescription(patientId);
        await this.#api.placeOrder(this.apiBase(), {
          patientId,
          kind: 'prescription',
          detail: this.rxItems().map((item) => item.drug).join(', '),
        });
      }
      this.encountersaved.emit({ patientId, encounterId: saved.id });
      // Encounter close → AVS (the same datum the patient sees in MyChart).
      this.closedAvs.set(
        `Resumen de la visita (${optimistic.date}): ${soap.assessment}. Plan: ${soap.plan || 'seguimiento'}.`,
      );
      this.view.set('chart');
      this.chartTab.set('evolution');
      this.viewchange.emit('chart');
    } catch (error) {
      this.errorMessage.set('No pudimos guardar la nota. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  private applyEncounter(chart: PatientChart, encounter: Encounter): void {
    this.chart.set({
      ...chart,
      history: [encounter, ...chart.history],
      encounters: [encounter, ...chart.encounters],
    });
  }

  private replaceEncounter(tempId: string, saved: Encounter): void {
    const chart = this.chart();
    if (!chart) {
      return;
    }
    const swap = (list: readonly Encounter[]): readonly Encounter[] =>
      list.map((encounter) => (encounter.id === tempId ? saved : encounter));
    this.chart.set({ ...chart, history: swap(chart.history), encounters: swap(chart.encounters) });
  }

  private async persistPrescription(patientId: string): Promise<void> {
    const chart = this.chart();
    if (!chart || this.rxItems().length === 0) {
      return;
    }
    const optimistic: Prescription = {
      id: `${patientId}-RX-${Date.now().toString(36)}`,
      patientId,
      doctorId: chart.patient.primaryDoctorId,
      doctorName: this.doctorName(chart.patient.primaryDoctorId),
      date: new Date().toISOString().slice(0, 10),
      items: this.rxItems(),
      interactions: this.rxInteractions(),
    };
    this.chart.set({ ...chart, prescriptions: [optimistic, ...chart.prescriptions] });
    const saved = await this.#api.savePrescription(
      this.apiBase(),
      { patientId, items: optimistic.items },
      optimistic,
    );
    const current = this.chart();
    if (current) {
      this.chart.set({
        ...current,
        prescriptions: current.prescriptions.map((prescription) =>
          prescription.id === optimistic.id ? saved : prescription,
        ),
      });
    }
  }

  doctorName(doctorId: string): string {
    return this.doctors().find((doctor) => doctor.id === doctorId)?.name ?? 'Médico tratante';
  }

  // ─── Display helpers ──────────────────────────────────────────────────────────
  roleLabel(role: EhrRole): string {
    return ROLES.find((entry) => entry.key === role)?.label ?? role;
  }

  sexLabel(sex: Patient['sex']): string {
    switch (sex) {
      case 'F':
        return 'Femenino';
      case 'M':
        return 'Masculino';
      default:
        return 'Otro';
    }
  }

  bloodPressureLabel(vitals: Vitals): string {
    return `${vitals.systolic}/${vitals.diastolic}`;
  }

  hasVitals(vitals: Vitals): boolean {
    return vitals !== EMPTY_VITALS && (vitals.systolic > 0 || vitals.weight > 0);
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  /** Bar height % for a point within its evolution series. */
  pointHeight(series: EvolutionSeries, value: number): number {
    const values = series.points.map((point) => point.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    return Math.round(8 + ((value - min) / span) * 92);
  }

  formatMinor(minorUnits: number, currency = 'COP'): string {
    const amount = minorUnits / 100;
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: currency || 'COP',
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
      return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(
        new Date(`${iso}T00:00:00`),
      );
    } catch {
      return iso;
    }
  }

  relativeTime(iso: string): string {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
      return '';
    }
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) {
      return 'ahora';
    }
    if (minutes < 60) {
      return `hace ${minutes} min`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `hace ${hours} h`;
    }
    const days = Math.round(hours / 24);
    return `hace ${days} d`;
  }

  private toNumber(value: string): number {
    const parsed = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
  }

  // ─── Track-by helpers ──────────────────────────────────────────────────────────
  trackCard = (_: number, card: HomeCard): string => card.id;
  trackResult = (_: number, result: LabResult): string => result.id;
  trackMed = (_: number, med: Medication): string => med.id;
  trackAppointment = (_: number, appt: Appointment): string => appt.id;
  trackSlot = (_: number, slot: ScheduleSlot): string => slot.appointmentId;
  trackString = (_: number, value: string): string => value;
}
