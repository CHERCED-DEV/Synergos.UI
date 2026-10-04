import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
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
  SegmentedComponent,
  SynEmptyStateComponent,
  SynSkeletonComponent,
  TabsComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { EhrProps } from '@synergos/contracts';
import { EhrApiClient, isEhrAccesoDenegado } from './ehr-api.client';
import { EHR_FLOW } from './ehr-fulfillment.strategy';
import {
  type Appointment,
  type BillingStatement,
  type EhrAcceso,
  type ChartTab,
  type ClinicalAlert,
  type Doctor,
  type EhrCopay,
  type EhrDataset,
  type EhrPortal,
  type EhrRole,
  type EhrView,
  type Encounter,
  type EvolutionSeries,
  type HealthMaintenanceItem,
  type HealthSummary,
  type HealthTab,
  type HomeCard,
  type InboxItem,
  type InboxKind,
  type KpiTile,
  type LabResult,
  type Medication,
  type ClinicalMessage,
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
import {
  baseDeRuta,
  mismaRuta,
  segmentosDeRuta,
  formatearImporte,
  desdeMenores,
  diaLocal,
  diaLocalMas,
} from '@synergos/vitals-core';

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
 * El `config` que manda el CMS tiene la forma de `EhrProps`, GENERADO del record C# (ADR 0135):
 * lo del editor y dónde vive la API para el sitio, que sale de `Synergos:Features:Ehr` y el
 * editor no ve (ADR 0137, CMS#196). La moneda no es configuración: llega con cada precio. Lo que
 * sólo entraba por el JSON libre queda como atributo del tag crudo con su valor del componente.
 */
export type EhrConfig = Partial<EhrProps>;

/** Typed event map for the transaction bus (ehr ↔ appointment ↔ refill ↔ order). */
interface EhrBus extends Record<string, unknown> {
  readonly appointmentbooked: { readonly appointmentId: string; readonly patientId: string };
  readonly refillrequested: { readonly medicationId: string; readonly patientId: string };
}

const DEFAULT_CLINIC = 'Clínica Synergos';
const DEFAULT_SCOPE = 'ehr';

/** El fallo del asistente de citas, con o sin copago: la cita NO quedó (UI#91). */
const CITA_NO_AGENDADA = 'No pudimos agendar la cita: el hueco NO quedó apartado. Vuelve a intentarlo.';

const DEFAULT_ROLE: EhrRole = 'patient';
/** El login del sitio, con la vuelta a ESTA página (el mismo de gov, blogs y realty). */
const LOGIN_PATH = '/account/login';
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

type ScheduleMode = 'in-person' | 'video';

/** Las modalidades de la cita, en el orden en que las pinta `syn-segmented` (#83). */
const SCHEDULE_MODES: readonly { readonly value: ScheduleMode; readonly label: string }[] = [
  { value: 'in-person', label: 'Presencial' },
  { value: 'video', label: 'Video' },
];

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeEhrConfig(value: EhrConfig): EhrConfig {
  // Sin `patient` (CMS#197): el paciente ya no lo elige el editor —ni un `P-1` del componente—,
  // lo resuelve el servidor por la sesión del miembro.
  return omitUndefinedProperties<EhrProps>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
  });
}

function coerceRole(value: unknown): EhrRole | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'patient' || raw === 'doctor' || raw === 'nurse' ? raw : undefined;
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
    TabsComponent,
    SegmentedComponent,
    SynSkeletonComponent,
    SynEmptyStateComponent,
  ],
  templateUrl: './ehr.html',
  styleUrl: './ehr.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements may be hydrated by the CMS shell.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-ehr' },
})
export class EhrElementComponent implements OnInit {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<EhrBus>>(TransactionEventBusService);
  readonly #api = inject(EhrApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<EhrConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<EhrProps>(sanitizeEhrConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly clinicInput = input<string | undefined>(undefined, { alias: 'clinic' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });

  /**
   * Dónde vive la API. Sin ella no se llama a nada y cada vista degrada a su muestra, visible:
   * no hay una base de respaldo compilada (ADR 0137).
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  readonly clinic = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.clinicInput()), undefined, DEFAULT_CLINIC),
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), undefined, DEFAULT_SCOPE),
  );
  readonly initialRole = computed<EhrRole>(() =>
    resolveConfigValue(coerceRole(this.roleInput()), undefined, DEFAULT_ROLE),
  );
  /**
   * El paciente del portal: el de la historia vinculada a la SESIÓN, tal como lo devuelve
   * `portal/home` (CMS#197). Era un atributo `patient` —el del editor, o `P-1` por defecto— que
   * viajaba en `?patient=`: cualquiera leía la historia de cualquiera cambiando el atributo.
   * Vacío mientras el servidor no lo dijo; nunca uno de demo.
   */
  readonly patientId = computed(() => this.home()?.patient.id ?? '');
  /**
   * El copago de una consulta, de la MISMA fuente que lo cobra al agendar (CMS#196). Era
   * `DEFAULT_COPAY_MINOR = 0` y la pantalla decía «Sin costo» mientras el servidor capturaba 80.000.
   * `null` mientras no se sabe —o si no se pudo saber—, nunca un cero inventado.
   */
  readonly copay = signal<EhrCopay | null>(null);
  #pidiendoCopago = false;
  readonly copayMinor = computed(() => this.copay()?.amountMinor ?? 0);
  /** Lo que se dice cuando el copago no se pudo saber: ni «Sin costo» ni un número. */
  readonly copayUnknown = computed(() => this.copay() === null);

  readonly instanceId = (ehrInstanceId += 1);
  readonly fieldId = `syn-ehr-${this.instanceId}`;
  readonly roles = ROLES;
  readonly patientNav = PATIENT_NAV;
  readonly clinicianNav = CLINICIAN_NAV;
  readonly checkinSteps = E_CHECKIN_STEPS;

  /**
   * Cuántas tarjetas esqueleto reservan la rejilla del portal mientras carga. Los
   * huesos son `aria-hidden` (decorativos); el aviso viaja en un `role="status"`
   * visually-hidden aparte, para no dejar mudo al lector de pantalla.
   */
  readonly homeSkeletons = [0, 1, 2, 3];
  /** Paneles del molde de la ficha clínica (rama `chart` mientras carga). */
  readonly chartSkeletons = [0, 1, 2];

  /**
   * Content-tab descriptors fed to the shared `syn-tabs` primitive. We consume it
   * as the accessible tablist only (roving tabindex + Arrow/Home/End + focus come
   * for free); the rich `@switch` panels stay in this module's template, so `content`
   * is intentionally empty and the primitive's own text panel is hidden in the SCSS.
   */
  readonly healthTabs: readonly { readonly id: HealthTab; readonly label: string; readonly content: string }[] = [
    { id: 'conditions', label: 'Condiciones', content: '' },
    { id: 'allergies', label: 'Alergias', content: '' },
    { id: 'immunizations', label: 'Vacunas', content: '' },
    { id: 'maintenance', label: 'Cuidado preventivo', content: '' },
  ];

  readonly chartTabs: readonly { readonly id: ChartTab; readonly label: string; readonly content: string }[] = [
    { id: 'summary', label: 'SnapShot', content: '' },
    { id: 'history', label: 'Notas', content: '' },
    { id: 'results', label: 'Resultados', content: '' },
    { id: 'medications', label: 'Fórmulas', content: '' },
    { id: 'evolution', label: 'Evolución', content: '' },
  ];

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
   * La base de la API con la que se cargó por última vez. En Angular Elements el `config`
   * del CMS —que la trae— se aplica DESPUÉS del constructor, así que el effect de carga
   * reacciona a ella: recarga la vista ACTUAL —los enlaces profundos también— cuando llega
   * o cambia. `null` es «no se cargó nada todavía» (nunca igual a una base resuelta, ni a la
   * vacía). Antes reaccionaba al `patient` del editor, que #197 retiró.
   */
  #lastLoadedBase: string | null = null;

  // ─── Quién mira: lo que contestó el SERVIDOR (CMS#197) ───────────────────────
  /**
   * Si el portal del paciente se puede abrir: la historia vinculada al correo del miembro.
   * `sin-sesion` (401) pide iniciar sesión; `sin-historia` (404 con `{ error }`) es un estado
   * vacío —la cuenta no tiene historia—, no un error. **Ninguno cae a datos de demostración**:
   * se degrada por AUSENCIA, nunca por NEGACIÓN (ADR 0112).
   */
  readonly portalAccess = signal<EhrAcceso>('ok');
  /** Si la superficie clínica se puede abrir: `sin-sesion` (401) o `sin-permiso` (403, sin rol). */
  readonly clinicAccess = signal<EhrAcceso>('ok');
  /** El acceso de la superficie que se está mirando: lo que decide si se pinta el panel. */
  readonly access = computed<EhrAcceso>(() =>
    this.portal() === 'patient' ? this.portalAccess() : this.clinicAccess(),
  );
  /**
   * La bandeja clínica pidió de QUÉ médico es (#197): quien mira es clínico sin médico
   * vinculado —enfermería, admin, o el directorio de demo, sin correos—. Se elige en la
   * propia bandeja; vacío hasta que se elige.
   */
  readonly inboxNeedsProvider = signal(false);
  readonly inboxProvider = signal('');
  /** Contenedor del panel de acceso: se enfoca al aparecer, como en realty (WCAG 2.4.3). */
  readonly accessPanel = viewChild<ElementRef<HTMLElement>>('accessPanel');
  /**
   * «Al usuario acaban de negarle algo; enfoca el panel en cuanto exista.» Latch de una sola
   * vez: un `effect` sobre el acceso le robaría el foco en cada re-render.
   */
  readonly #accessFocusPending = signal(false);

  /** Only clinicians (doctor / nurse) may author encounters, e-Rx and release results. */
  readonly canClinicalWrite = computed(() => this.role() === 'doctor' || this.role() === 'nurse');

  /**
   * Polite screen-reader announcement of the active profile. The role switch changes
   * the whole portal/journey (navigation, not a toggle), so the context change is
   * surfaced through an `aria-live` region rather than `aria-pressed` state.
   */
  readonly roleAnnouncement = computed(() => {
    const label = this.roleLabel(this.role());
    const portal = this.portal() === 'patient' ? 'portal del paciente' : 'portal clínico';
    return `Perfil activo: ${label}. Estás en el ${portal}.`;
  });

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
  readonly scheduleModes = SCHEDULE_MODES;
  readonly scheduleMode = signal<ScheduleMode>('in-person');
  readonly confirmedAppointmentRef = signal('');

  // ─── Messaging (SH-7, shared graph) ──────────────────────────────────────────
  readonly threads = signal<readonly MessageThread[]>([]);
  readonly threadsLoaded = signal(false);
  readonly activeThread = signal<MessageThread | null>(null);
  readonly sendingMessage = signal(false);

  // ─── CLINICIAN portal state ──────────────────────────────────────────────────
  readonly board = signal<readonly ScheduleSlot[]>([]);
  readonly boardLoaded = signal(false);
  /**
   * El día de la agenda: HOY en el calendario de quien mira, no en UTC. Con `toISOString()`, desde
   * las 19:00 de Bogotá la agenda pedía la del día siguiente.
   */
  readonly boardDate = signal(diaLocal());

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
  /** The id the last `loadChart` was asked for — kept so a failed open can retry. */
  readonly chartRequestId = signal('');

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

  // ─── Reads that FAILED (#106) ────────────────────────────────────────────────
  /**
   * Which reads could not be served. A failed clinical read no longer degrades to
   * seeded data, so its signal stays pristine — and a pristine signal is
   * indistinguishable from «the server answered, and there is nothing». The two have
   * to look different on screen: «no pudimos leer tus alergias» is not «no tienes
   * alergias», and saying the second when the first is true is the same defect with a
   * politer face.
   */
  readonly #unavailable = signal<ReadonlySet<EhrDataset>>(new Set());

  /** True when THIS dataset's last read failed. Read from templates by name. */
  readFailed(dataset: EhrDataset): boolean {
    return this.#unavailable().has(dataset);
  }

  /** Record the outcome of a read round for `dataset`. */
  private markRead(dataset: EhrDataset, ok: boolean): void {
    this.#unavailable.update((current) => {
      if (current.has(dataset) === !ok) {
        return current;
      }
      const next = new Set(current);
      if (ok) {
        next.delete(dataset);
      } else {
        next.add(dataset);
      }
      return next;
    });
  }

  /**
   * Re-run the current view's load. The `*Loaded` flags stay `false` after a failure,
   * so re-dispatching the route is enough — and the chart needs the id it was opened
   * with, which the failed load remembered.
   */
  retryRead(): void {
    this.errorMessage.set('');
    this.applyRoute(this.view(), this.chart()?.patient.id ?? this.chartRequestId());
  }

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
    // «No hay filas» es una afirmación sobre el día del médico, y no se puede hacer
    // cuando lo que pasó es que no se pudo leer (#106): una agenda vacía y una agenda
    // ilegible se ven igual en una tabla.
    emptyMessage: this.consoleSectionUnreadable()
      ? 'No pudimos leer esta sección. La tabla está vacía porque la lectura falló, no porque no haya filas.'
      : 'No hay filas en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      { id: 'board', label: 'Agenda del día', kind: 'table', badge: this.board().length || undefined },
      { id: 'patients', label: 'Pacientes', kind: 'table', badge: this.patients().length || undefined },
      { id: 'inbasket', label: 'In Basket', kind: 'table', badge: this.pendingInboxCount() || undefined },
    ],
  }));

  readonly pendingInboxCount = computed(() => this.inbox().filter((item) => !item.done).length);

  /** Whether the read behind the console section on screen failed. */
  readonly consoleSectionUnreadable = computed(() => {
    const section = this.consoleSection();
    const dataset: EhrDataset =
      section === 'patients' ? 'patients' : section === 'inbasket' ? 'inbox' : 'board';
    return this.readFailed(dataset);
  });

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
    // Sin saberlo también hay paso: es donde se dice que no se sabe, en vez de «Sin costo».
    if (this.copayMinor() > 0 || this.copayUnknown()) {
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
      totalLabel: this.copayMinor() > 0 || this.copayUnknown() ? 'Copago' : 'Sin costo',
      // La cita NO quedó agendada, y lo dice el ASISTENTE, una vez (UI#91). Lo elegido sigue
      // en el carrito: reintentar es un clic. El `APPT-…` del `pay` es local y no mueve
      // dinero; medido, con el texto por defecto esta cita decía «Ya recibimos tu pago
      // (referencia APPT-…)», y la ficha repetía el fallo en un segundo `role="alert"`.
      payFailedMessage: CITA_NO_AGENDADA,
      confirmFailedMessage: CITA_NO_AGENDADA,
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

    // Effect de carga: reacciona a la base de la API, que en Angular Elements llega DESPUÉS
    // del constructor con el `config` del CMS. Guardado por `#lastLoadedBase` para no
    // recargar con la misma base. La identidad ya no es un input: la pone la sesión (#197).
    effect(() => {
      const base = this.apiBase();
      if (base === this.#lastLoadedBase) {
        return;
      }
      this.#lastLoadedBase = base;
      // Sólo `apiBase()` es dependencia — la recarga lee y escribe muchas otras señales.
      untracked(() => this.reloadForIdentity());
    });

    // WCAG 2.4.3: el panel de acceso está tras un `@if`, así que cuando una negativa pide el
    // foco todavía no existe. Este effect reúne las dos señales y apaga el latch al enfocar.
    effect(() => {
      const panel = this.accessPanel();
      if (!this.#accessFocusPending() || !panel) {
        return;
      }
      this.#accessFocusPending.set(false);
      // El CONTENEDOR, no el botón: así el lector lee el porqué antes que las acciones.
      panel.nativeElement.focus();
    });
  }

  /**
   * Una NEGATIVA del servidor (CMS#197) pasa a ser el estado de su superficie, y no una lectura
   * fallida: no se dice «no pudimos cargar», no se ofrece reintentar y no se pinta nada de
   * nadie. Devuelve `true` si era una negativa (y ya quedó tratada).
   *
   * `sin-medico` no cierra la superficie: es la bandeja clínica pidiendo de qué médico es.
   */
  private negado(error: unknown, superficie: 'portal' | 'clinica'): boolean {
    if (!isEhrAccesoDenegado(error)) {
      return false;
    }
    this.errorMessage.set('');
    if (error.motivo === 'sin-medico') {
      this.inboxNeedsProvider.set(true);
      return true;
    }
    (superficie === 'portal' ? this.portalAccess : this.clinicAccess).set(error.motivo);
    this.#accessFocusPending.set(true);
    return true;
  }

  /** El login del sitio con la vuelta a ESTA página. Método: el hash cambia al navegar. */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return LOGIN_PATH;
    }
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `${LOGIN_PATH}?returnUrl=${encodeURIComponent(here)}`;
  }

  /**
   * Resuelve la ruta inicial del hash (enlace profundo) ANTES de que cargue nada, para que el
   * effect de identidad recargue la vista CORRECTA (no sólo el inicio).
   *
   * No va en el constructor: en un custom element los inputs —el `config` del CMS, con la base
   * de la API— se aplican DESPUÉS de crear el componente, y la ruta dispara cargas (el defecto que
   * el piloto de la ADR 0137 encontró en `eventos`, CMS#194). Sigue antes del primer ciclo, que es
   * cuando corre por primera vez el effect.
   */
  ngOnInit(): void {
    this.applyHash();
  }

  /**
   * Invalidate every patient-scoped `*Loaded` flag and reload the CURRENT view for the
   * resolved identity. Clinician board data (patients/schedule/inbox from the provider,
   * not the patient scope) is only reset when we're actually in the clinician portal.
   */
  private reloadForIdentity(): void {
    // Ronda nueva: lo que falló o se negó con la base anterior no dice nada de ésta, así que
    // las marcas se limpian y sólo vuelven si ESTA ronda falla o se niega también.
    this.#unavailable.set(new Set());
    this.portalAccess.set('ok');
    this.clinicAccess.set('ok');
    this.inboxNeedsProvider.set(false);
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
          void this.conElPaciente(() => this.loadMyAppointments());
        }
        return;
      case 'schedule':
        void this.conElPaciente(() => this.ensureDoctors());
        this.#store.reset();
        return;
      case 'results':
        if (!this.resultsLoaded()) {
          void this.conElPaciente(() => this.loadResults());
        }
        return;
      case 'medications':
        if (!this.medsLoaded()) {
          void this.conElPaciente(() => this.loadMedications());
        }
        return;
      case 'health':
        this.healthTab.set('conditions');
        if (!this.healthLoaded()) {
          void this.conElPaciente(() => this.loadHealth());
        }
        return;
      case 'billing':
        if (!this.billingLoaded()) {
          void this.conElPaciente(() => this.loadBilling());
        }
        return;
      case 'messages':
        if (!this.threadsLoaded()) {
          void this.conElPaciente(() => this.loadThreads());
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
    const base = baseDeRuta(this.scope());
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
    if (!mismaRuta(window.location.hash, hash)) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (mismaRuta(hash, this.#suppressedHash)) {
      this.#suppressedHash = '';
      return;
    }
    const segments = segmentosDeRuta(hash, this.scope());
    if (!segments) {
      return;
    }
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
      this.applyRoute('chart', tail);
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
  /**
   * El portal abre con su IDENTIDAD (CMS#197): `portal/home` dice de quién es —y si hay sesión
   * e historia vinculada— antes que cualquier otra lectura del paciente, y su `patient.id` es
   * el único id de paciente que esta app usa. Si el servidor niega, la vista no se pide: se
   * pinta el panel de acceso. Una caída de red NO cierra el paso (eso es ausencia, no negativa).
   */
  private async conElPaciente(cargar: () => Promise<void>): Promise<void> {
    if (!this.homeLoaded() && this.portalAccess() === 'ok') {
      await this.loadHome();
    }
    if (this.portalAccess() !== 'ok') {
      return;
    }
    await cargar();
  }

  private async loadHome(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const home = await this.#orchestrator.callApi(`portal-home:${this.apiBase()}`, () =>
        this.#api.portalHome(this.apiBase()),
      );
      this.home.set(home);
      this.homeLoaded.set(true);
      this.markRead('home', true);
    } catch (error) {
      this.home.set(null);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('home', false);
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
  /**
   * Las citas del paciente: la próxima, que trae `portal/home` del paciente de la SESIÓN.
   *
   * Antes completaba la lista con `GET /appointments` filtrado en el navegador por el
   * `patientId` de la página —la agenda de TODOS los pacientes de la clínica, bajada a la
   * página de uno—. Desde #197 esa ruta es de la superficie clínica (rol) y un paciente recibe
   * 403; el portal no tiene, hoy, una lista propia de citas pasadas.
   */
  private async loadMyAppointments(): Promise<void> {
    this.loading.set(true);
    try {
      const home = this.home() ?? (await this.#api.portalHome(this.apiBase()));
      const list: Appointment[] = home.nextAppointment ? [home.nextAppointment] : [];
      this.myAppointments.set(list);
      this.appointmentsLoaded.set(true);
      this.markRead('appointments', true);
    } catch (error) {
      this.myAppointments.set([]);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('appointments', false);
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
      const results = await this.#api.results(this.apiBase());
      this.results.set(results);
      this.resultsLoaded.set(true);
      this.markRead('results', true);
    } catch (error) {
      this.results.set([]);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('results', false);
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
      const meds = await this.#api.medications(this.apiBase());
      this.medications.set(meds);
      this.medsLoaded.set(true);
      this.markRead('medications', true);
    } catch (error) {
      this.medications.set([]);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('medications', false);
      this.errorMessage.set('No pudimos cargar tus medicamentos.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Optimista mientras va, y **se DESHACE si no llegó** (#111).
   *
   * Antes el `catch` del cliente devolvía el `'requested'` que le pasaba este mismo
   * llamador, así que la píldora quedaba «Solicitada» para siempre con el servidor
   * sin nada: el paciente esperaba una renovación que nadie pidió y se quedaba sin
   * medicamento. El estado vuelve al que tenía —no a `null`, que sería otra
   * afirmación— y la pantalla lo dice.
   */
  requestRefill(medication: Medication): void {
    if (medication.refillStatus === 'requested') {
      return;
    }
    const previo = medication.refillStatus;
    this.patchMedication(medication.id, (med) => ({ ...med, refillStatus: 'requested' as RefillStatus }));
    const payload = { medicationId: medication.id, patientId: this.patientId() };
    this.refillrequested.emit(payload);
    this.#bus.publish('refillrequested', payload);
    // Sin `patientId` en el cuerpo (#197): el servidor pide la renovación para el paciente
    // de la sesión; el del evento es el que devolvió `portal/home`.
    void this.#api
      .requestRefill(this.apiBase(), { medicationId: medication.id })
      .then((status) => this.patchMedication(medication.id, (med) => ({ ...med, refillStatus: status })))
      .catch((error) => {
        this.patchMedication(medication.id, (med) => ({ ...med, refillStatus: previo }));
        if (this.negado(error, 'portal')) {
          return;
        }
        this.errorMessage.set(
          'No pudimos enviar tu solicitud de renovación: NO quedó registrada. Intenta de nuevo.',
        );
        void error;
      });
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
      const summary = await this.#api.healthSummary(this.apiBase());
      this.healthSummary.set(summary);
      this.healthLoaded.set(true);
      this.markRead('health', true);
    } catch (error) {
      this.healthSummary.set(null);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('health', false);
      this.errorMessage.set('No pudimos cargar tu resumen de salud.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  setHealthTab(tab: HealthTab): void {
    this.healthTab.set(tab);
  }

  /**
   * Chip copy for a preventive-care item. `null` is **no consta**, never «al día»:
   * the recommendation derives from age + sex (real data), whether the person had it
   * done needs a seam that does not exist (#106).
   */
  maintenanceStatusLabel(status: HealthMaintenanceItem['status']): string {
    switch (status) {
      case 'complete':
        return 'Al día';
      case 'overdue':
        return 'Vencido';
      case 'due':
        return 'Pendiente';
      default:
        return 'Sin registro';
    }
  }

  /**
   * Timeline stages from the immunization record (SH-4 tracking-timeline reuse).
   *
   * Only ever rendered when `immunizations` is a real list. `null` (no vaccination
   * registry, #106) takes its own branch in the template — an empty timeline reading
   * «Sin vacunas registradas» would state a clinical fact nobody established.
   */
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
      // `null` es «tu historia no tiene estado de cuenta» (#197): vacío, no ilegible.
      const statement = await this.#api.billing(this.apiBase());
      this.billing.set(statement);
      this.billingLoaded.set(true);
      this.markRead('billing', true);
    } catch (error) {
      this.billing.set(null);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('billing', false);
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
    // El copago se pide junto al directorio: los dos hacen falta para agendar. Una vez por
    // vez: entrar a agendar llama acá dos veces antes de que vuelva la primera (medido).
    if (this.copay() === null && !this.#pidiendoCopago) {
      this.#pidiendoCopago = true;
      void this.#api
        .copay(this.apiBase())
        .then(
          (copay) => this.copay.set(copay),
          () => this.copay.set(null),
        )
        .finally(() => (this.#pidiendoCopago = false));
    }
    if (this.doctorsLoaded()) {
      return;
    }
    try {
      const doctors = await this.#api.doctors(this.apiBase());
      this.doctors.set(doctors);
      this.doctorsLoaded.set(true);
      this.markRead('doctors', true);
      if (!this.scheduleDoctorId() && doctors[0]) {
        this.scheduleDoctorId.set(doctors[0].id);
      }
    } catch (error) {
      this.doctors.set([]);
      this.markRead('doctors', false);
      this.errorMessage.set('No pudimos cargar el directorio médico.');
      void error;
    }
  }

  /** Demo availability: next 7 days × 4 daily windows. */
  readonly availableSlots = computed<readonly { date: string; time: string }[]>(() => {
    const slots: { date: string; time: string }[] = [];
    const times = ['08:00', '10:00', '14:00', '16:00'];
    // El día de cada franja es LOCAL: el servidor lee `{ date, time }` como hora del sitio, y con
    // el día UTC «mañana a las 10» salía pasado mañana desde las 19:00.
    const today = new Date();
    for (let day = 1; day <= 7; day += 1) {
      const date = diaLocalMas(day, today);
      for (const time of times) {
        slots.push({ date, time });
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

  /**
   * Lo llama `syn-segmented`, que emite su `value` como string: sólo entra una
   * modalidad de la lista, y cualquier otra cosa se ignora en vez de viajar a la cita.
   */
  setScheduleMode(value: string): void {
    const mode = SCHEDULE_MODES.find((option) => option.value === value)?.value;
    if (mode) {
      this.scheduleMode.set(mode);
    }
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
          // Para que `confirm` pueda RESERVAR contra el borde y no acuñar un
          // comprobante en local (#111).
          apiBase: this.apiBase(),
        },
      },
      session,
    );
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.#store.setPricing({
      // La moneda del copago que contestó el servidor, no una escrita (CMS#196).
      currency: this.copay()?.currency ?? '',
      totalAmount: this.copayMinor(),
      balanceDue: this.copayMinor(),
      breakdown:
        this.copayMinor() > 0
          ? [{ code: 'copay', label: 'Copago de la cita', amount: this.copayMinor() }]
          : [],
    });
  }

  /**
   * Sólo se llega aquí cuando el borde YA reservó: el comprobante y la hora salen
   * del voucher, que la estrategia arma con lo que devolvió `POST /appointment`
   * (#111). Antes esto pintaba la cita con lo que el paciente había elegido en
   * pantalla, que es exactamente lo mismo se hubiera reservado o no.
   */
  onScheduleCompleted(result: CheckoutWizardResult): void {
    const voucher = result.vouchers[0];
    const detail = voucher?.detail ?? {};
    const texto = (key: string): string =>
      typeof detail[key] === 'string' ? (detail[key] as string) : '';
    this.confirmedAppointmentRef.set(voucher?.reference ?? result.reference);
    const appointment: Appointment = {
      id: voucher?.reference ?? result.reference,
      // A quién agendó el SERVIDOR (#197): el de la sesión, no el que la página creía.
      patientId: texto('patientId') || this.patientId(),
      patientName: texto('patientName') || this.home()?.patient.name || 'Paciente',
      doctorId: texto('doctorId') || this.scheduleDoctorId(),
      doctorName: texto('doctorName'),
      date: texto('date') || this.scheduleDate(),
      time: texto('time') || this.scheduleTime(),
      durationMin: 30,
      reason: texto('reason') || this.scheduleReason().trim() || 'Consulta',
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

  onScheduleExit(): void {
    this.navigate('visits');
  }

  // ─── Messaging (SH-7) ────────────────────────────────────────────────────────
  private async loadThreads(): Promise<void> {
    this.loading.set(true);
    try {
      // Sin `?user=` (#197): los hilos son los de quien está en la sesión.
      const threads = await this.#api.messages(this.apiBase());
      this.threads.set(threads);
      this.threadsLoaded.set(true);
      this.markRead('threads', true);
    } catch (error) {
      this.threads.set([]);
      this.activeThread.set(null);
      if (this.negado(error, 'portal')) {
        return;
      }
      this.markRead('threads', false);
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
      .sendMessage(this.apiBase(), { threadId, body })
      .catch((error) => {
        this.markMessageFailed(threadId, local.id);
        if (this.negado(error, 'portal')) {
          return;
        }
        this.errorMessage.set('Tu mensaje NO se envió. Queda en el hilo para reintentarlo.');
        void error;
      })
      .finally(() => this.sendingMessage.set(false));
  }

  /**
   * El mensaje que no llegó se queda en el hilo **marcado**, no desaparece ni se
   * queda con cara de enviado (#111).
   *
   * Las dos alternativas mienten o pierden: una burbuja sin marca es un acuse —y en
   * mensajería clínica el paciente cuenta con que su médico lo leyó—, y borrarla se
   * lleva lo que acaba de escribir. Marcada, el texto sigue ahí y se reintenta desde
   * el propio hilo.
   */
  private markMessageFailed(threadId: string, messageId: string): void {
    this.patchThread(threadId, (thread) => ({
      ...thread,
      messages: thread.messages.map((message) =>
        message.id === messageId ? { ...message, failed: true } : message,
      ),
    }));
  }

  /** Reintentar el envío del mensaje marcado, sin volver a teclearlo. */
  retryMessage(thread: MessageThread, message: ClinicalMessage): void {
    if (!message.failed || this.sendingMessage()) {
      return;
    }
    this.sendingMessage.set(true);
    void this.#api
      .sendMessage(this.apiBase(), { threadId: thread.id, body: message.body })
      .then(() => {
        this.patchThread(thread.id, (entry) => ({
          ...entry,
          messages: entry.messages.map((item) =>
            item.id === message.id ? { ...item, failed: false } : item,
          ),
        }));
        this.errorMessage.set('');
      })
      .catch((error) => {
        if (this.negado(error, 'portal')) {
          return;
        }
        this.errorMessage.set('Tu mensaje sigue sin enviarse. Queda en el hilo.');
        void error;
      })
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
  /**
   * La agenda del día y la lista de pacientes; la bandeja va APARTE (#197): puede pedir de qué
   * médico es (`sin-medico`) sin que eso tumbe la agenda, que no depende de ello.
   */
  private async loadBoard(): Promise<void> {
    this.loading.set(true);
    try {
      const [board, patients] = await Promise.all([
        this.#orchestrator.callApi(`board:${this.boardDate()}`, () =>
          this.#api.schedule(this.apiBase(), this.boardDate()),
        ),
        this.#api.patients(this.apiBase(), ''),
      ]);
      this.board.set(board);
      this.boardLoaded.set(true);
      this.patients.set(patients);
      this.patientsLoaded.set(true);
      this.markRead('board', true);
      this.markRead('patients', true);
    } catch (error) {
      this.board.set([]);
      this.patients.set([]);
      if (this.negado(error, 'clinica')) {
        return;
      }
      this.markRead('board', false);
      this.markRead('patients', false);
      this.errorMessage.set('No pudimos cargar la agenda del día.');
    } finally {
      this.loading.set(false);
    }
    if (this.clinicAccess() === 'ok' && !this.inboxLoaded()) {
      await this.leerBandeja();
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
      this.markRead('patients', true);
    } catch (error) {
      this.patients.set([]);
      if (this.negado(error, 'clinica')) {
        return;
      }
      this.markRead('patients', false);
      this.errorMessage.set('No pudimos cargar los pacientes.');
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
      await this.leerBandeja();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Lee la bandeja del médico de la sesión, o la del que se eligió (`inboxProvider`). Antes
   * mandaba el NOMBRE del rol (`'doctor'`) como `provider`, que no es el id de ningún médico:
   * la bandeja salía vacía y se leía como «al día» (#197).
   */
  private async leerBandeja(): Promise<void> {
    try {
      const inbox = await this.#api.inbox(this.apiBase(), this.inboxProvider());
      this.inbox.set(inbox);
      this.inboxLoaded.set(true);
      this.inboxNeedsProvider.set(false);
      this.markRead('inbox', true);
    } catch (error) {
      this.inbox.set([]);
      if (this.negado(error, 'clinica')) {
        if (this.inboxNeedsProvider()) {
          void this.ensureDoctors();
        }
        return;
      }
      this.markRead('inbox', false);
      this.errorMessage.set('No pudimos cargar el In Basket.');
    }
  }

  /** Quien mira eligió de qué médico es la bandeja (clínico sin médico vinculado, #197). */
  chooseInboxProvider(doctorId: string): void {
    this.inboxProvider.set(doctorId.trim());
    this.inboxLoaded.set(false);
    if (this.inboxProvider()) {
      void this.loadInbox();
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
    this.chartRequestId.set(id);
    try {
      const chart = await this.#api.patientChart(this.apiBase(), id);
      this.chart.set(chart);
      this.chartTab.set('summary');
      this.view.set('chart');
      this.patientselect.emit(id);
      this.viewchange.emit('chart');
      this.markRead('chart', true);
    } catch (error) {
      // Nothing is shown in place of a chart we could not read. The previous branch
      // handed back patient zero's record under this id (#106).
      this.chart.set(null);
      this.view.set('chart');
      if (this.negado(error, 'clinica')) {
        return;
      }
      this.markRead('chart', false);
      this.errorMessage.set('No pudimos abrir la ficha del paciente.');
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
    this.resetWriteProgress();
    this.view.set('chart');
    this.chartTab.set('summary');
    this.errorMessage.set('');
    this.viewchange.emit('chart');
  }

  private resetEncounterDraft(): void {
    // Un intento anterior a medias NO se hereda: con `notaGuardada` viva, el
    // encuentro SIGUIENTE se saltaría su propia nota y el paciente se quedaría sin
    // ella. La memoria del reintento dura lo que dura el formulario.
    this.resetWriteProgress();
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

  /**
   * Cerrar el encuentro: nota SOAP → receta → orden. **Nada se pinta en la historia
   * antes de que el servidor lo devuelva** (#111).
   *
   * Lo que había: la nota se metía en la historia ANTES de llamar, y el `catch` del
   * cliente devolvía esa misma nota optimista, así que un fallo del `POST` acababa
   * en la pantalla de siempre —encuentro documentado, vuelta a la historia, AVS
   * escrito— con el expediente del paciente **sin nada**. La firma del médico
   * incluida. Lo mismo con la receta.
   *
   * **Lo tecleado no se pierde y no se duplica.** Al fallar, el formulario se queda
   * como está —texto, vitales, ítems de receta— y lo que YA quedó guardado se
   * recuerda (`#notaGuardada`, `#recetaEmitida`), así que reintentar continúa donde
   * se cortó en vez de abrir un segundo encuentro para la misma consulta. Un
   * expediente clínico duplicado es un daño propio, no «un botón de más».
   */
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
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      let saved = this.notaGuardada();
      if (!saved) {
        saved = await this.#api.saveEncounter(this.apiBase(), { patientId, soap });
        this.notaGuardada.set(saved);
        this.applyEncounter(this.chart() ?? chart, saved);
      }
      if (this.rxItems().length > 0 && !this.recetaEmitida()) {
        await this.persistPrescription(patientId);
        this.recetaEmitida.set(true);
      }
      if (this.rxItems().length > 0 && !this.ordenCursada()) {
        await this.#api.placeOrder(this.apiBase(), {
          patientId,
          kind: 'prescription',
          detail: this.rxItems().map((item) => item.drug).join(', '),
        });
        this.ordenCursada.set(true);
      }
      this.encountersaved.emit({ patientId, encounterId: saved.id });
      // Encounter close → AVS (the same datum the patient sees in MyChart).
      this.closedAvs.set(
        `Resumen de la visita (${saved.date}): ${soap.assessment}. Plan: ${soap.plan || 'seguimiento'}.`,
      );
      this.resetWriteProgress();
      this.view.set('chart');
      this.chartTab.set('evolution');
      this.viewchange.emit('chart');
    } catch (error) {
      // El mensaje nombra lo que SÍ quedó: decirle «no pudimos guardar la nota» a
      // quien ya la tiene guardada le invita a escribirla otra vez. Una NEGATIVA (#197) se
      // dice como tal y en el mismo aviso: el formulario NO se cambia por el panel de
      // acceso, porque lo tecleado tiene que seguir a la vista.
      this.errorMessage.set(this.mensajeDeNegacion(error) ?? this.mensajeDeEscrituraFallida());
    } finally {
      this.loading.set(false);
    }
  }

  /** Qué se llevó el servidor de este encuentro, para no repetirlo al reintentar. */
  readonly notaGuardada = signal<Encounter | null>(null);
  readonly recetaEmitida = signal(false);
  readonly ordenCursada = signal(false);

  private resetWriteProgress(): void {
    this.notaGuardada.set(null);
    this.recetaEmitida.set(false);
    this.ordenCursada.set(false);
  }

  /** El aviso de una escritura NEGADA (#197), o `null` si fue otra cosa. */
  private mensajeDeNegacion(error: unknown): string | null {
    if (!isEhrAccesoDenegado(error)) {
      return null;
    }
    const guardado = this.notaGuardada() ? ' Lo que ya quedó guardado no se repite.' : '';
    return error.motivo === 'sin-sesion'
      ? `Tu sesión no está activa: inicia sesión y reintenta. Tu texto sigue acá.${guardado}`
      : `Tu cuenta no tiene permiso clínico para guardar esto. Tu texto sigue acá.${guardado}`;
  }

  private mensajeDeEscrituraFallida(): string {
    if (!this.notaGuardada()) {
      return 'No pudimos guardar la nota: NO quedó en la historia. Tu texto sigue acá.';
    }
    if (!this.recetaEmitida()) {
      return 'La nota quedó guardada, pero la receta NO se emitió. Reintenta: la nota no se duplica.';
    }
    return 'La nota y la receta quedaron guardadas, pero la orden no salió. Reintenta para cursarla.';
  }

  private applyEncounter(chart: PatientChart, encounter: Encounter): void {
    this.chart.set({
      ...chart,
      history: [encounter, ...chart.history],
      encounters: [encounter, ...chart.encounters],
    });
  }

  /**
   * Emite la receta y **la pinta sólo si el servidor la devolvió**. Lanza si no: una
   * receta en la historia que la farmacia no puede ver es peor que ninguna.
   */
  private async persistPrescription(patientId: string): Promise<void> {
    const chart = this.chart();
    if (!chart || this.rxItems().length === 0) {
      return;
    }
    const saved = await this.#api.savePrescription(this.apiBase(), {
      patientId,
      items: this.rxItems(),
    });
    const current = this.chart();
    if (current) {
      this.chart.set({ ...current, prescriptions: [saved, ...current.prescriptions] });
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

  formatMinor(minorUnits: number, currency: string): string {
    return formatearImporte(desdeMenores(minorUnits, currency), currency);
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
