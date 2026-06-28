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
import { EhrApiClient } from './ehr-api.client';
import {
  type Appointment,
  type AppointmentStatus,
  type ChartTab,
  type ClinicalAlert,
  type Doctor,
  type EhrRole,
  type EhrView,
  type Encounter,
  type EvolutionSeries,
  type KpiTile,
  type Patient,
  type PatientChart,
  type Prescription,
  type PrescriptionItem,
  type SoapNote,
  type Vitals,
} from './ehr.model';

/**
 * Runtime config for the CMS element <c>elementSynEhr</c>.
 *
 * The Healthcare vertical as a real clinical dashboard (EHR-lite): clinical home
 * with KPIs + agenda + alerts, patient list → chart (history, evolution,
 * prescriptions, appointments), SOAP encounter + prescription authoring, provider
 * directory, and an appointment scheduler — all admin-panel CRUD, with a demo
 * role-switcher (admin / médico / enfermería) gating write actions.
 */
export interface EhrRuntimeConfig {
  /** Base URL of the EHR API. Default `/api/ehr`. */
  readonly apiBase?: string;
  /** Display name of the clinic shown in the shell header. Default `Clínica Synergos`. */
  readonly clinic?: string;
  /** Initial demo role. Default `admin`. */
  readonly role?: EhrRole;
}

const DEFAULT_API_BASE = '/api/ehr';
const DEFAULT_CLINIC = 'Clínica Synergos';
const DEFAULT_ROLE: EhrRole = 'admin';

const ROLES: readonly { key: EhrRole; label: string }[] = [
  { key: 'admin', label: 'Administración' },
  { key: 'doctor', label: 'Médico' },
  { key: 'nurse', label: 'Enfermería' },
];

const NAV_ITEMS: readonly { view: EhrView; label: string; icon: string }[] = [
  { view: 'dashboard', label: 'Tablero', icon: '◫' },
  { view: 'patients', label: 'Pacientes', icon: '☰' },
  { view: 'appointments', label: 'Agenda', icon: '◷' },
  { view: 'doctors', label: 'Médicos', icon: '✚' },
  { view: 'prescriptions', label: 'Fórmulas', icon: '℞' },
];

const EMPTY_VITALS: Vitals = {
  systolic: 0,
  diastolic: 0,
  heartRate: 0,
  temperature: 0,
  weight: 0,
  height: 0,
  glucose: 0,
};

function sanitizeConfig(value: Partial<EhrRuntimeConfig>): EhrRuntimeConfig {
  return omitUndefinedProperties<EhrRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    clinic: coerceTrimmedStringInput(value.clinic),
    role: coerceRole(value.role),
  });
}

function coerceRole(value: unknown): EhrRole | undefined {
  const raw = coerceTrimmedStringInput(value);
  return raw === 'admin' || raw === 'doctor' || raw === 'nurse' ? raw : undefined;
}

let ehrInstanceId = 0;

@Component({
  selector: 'sg-ehr',
  standalone: true,
  imports: [],
  templateUrl: './ehr.html',
  styleUrl: './ehr.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements may be hydrated by the CMS shell.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-ehr' },
})
export class EhrElementComponent {
  readonly #api = inject(EhrApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<EhrRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<EhrRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly clinicInput = input<string | undefined>(undefined, { alias: 'clinic' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly clinic = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.clinicInput()),
      this.config()?.clinic,
      DEFAULT_CLINIC,
    ),
  );

  readonly instanceId = (ehrInstanceId += 1);
  readonly fieldId = `syn-ehr-${this.instanceId}`;
  readonly roles = ROLES;
  readonly navItems = NAV_ITEMS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly viewchange = output<EhrView>();
  readonly patientselect = output<string>();
  readonly encountersaved = output<{ patientId: string; encounterId: string }>();
  readonly appointmentbooked = output<{ appointmentId: string; patientId: string }>();

  // ─── Shell state ────────────────────────────────────────────────────────────
  readonly view = signal<EhrView>('dashboard');
  readonly role = signal<EhrRole>(DEFAULT_ROLE);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly navOpen = signal(false);
  readonly globalSearch = signal('');

  // Patients
  readonly patients = signal<readonly Patient[]>([]);
  readonly patientsLoaded = signal(false);
  readonly patientQuery = signal('');

  // Doctors
  readonly doctors = signal<readonly Doctor[]>([]);
  readonly doctorsLoaded = signal(false);

  // Patient chart
  readonly chart = signal<PatientChart | null>(null);
  readonly chartTab = signal<ChartTab>('summary');

  // Appointments / agenda
  readonly appointments = signal<readonly Appointment[]>([]);
  readonly appointmentsLoaded = signal(false);
  readonly agendaDate = signal(new Date().toISOString().slice(0, 10));
  readonly agendaDoctorFilter = signal('');

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

  // Prescription composer (draft, used in the encounter/Rx flow)
  readonly rxItems = signal<readonly PrescriptionItem[]>([]);
  readonly rxDrug = signal('');
  readonly rxDose = signal('');
  readonly rxFrequency = signal('');
  readonly rxDuration = signal('');

  // Appointment booking draft
  readonly bookDoctorId = signal('');
  readonly bookPatientId = signal('');
  readonly bookDate = signal(new Date().toISOString().slice(0, 10));
  readonly bookTime = signal('08:00');
  readonly bookReason = signal('');

  // ─── Permissions (RBAC demo) ─────────────────────────────────────────────────
  /** Only clinicians (doctor / nurse) may author encounters & prescriptions. */
  readonly canClinicalWrite = computed(() => this.role() === 'doctor' || this.role() === 'nurse');
  /** Only admins / doctors may book appointments in the demo. */
  readonly canSchedule = computed(() => this.role() === 'admin' || this.role() === 'doctor');

  readonly degraded = computed(() => {
    // Recompute when any view's data changes so the banner stays accurate.
    void this.patientsLoaded();
    void this.doctorsLoaded();
    void this.appointmentsLoaded();
    void this.chart();
    return this.#api.degraded;
  });

  // ─── Dashboard derived ────────────────────────────────────────────────────────
  readonly todaysAppointments = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.appointments().filter((appointment) => appointment.date === today);
  });

  readonly kpis = computed<readonly KpiTile[]>(() => {
    const today = this.todaysAppointments();
    const total = today.length;
    const attended = today.filter(
      (appointment) =>
        appointment.status === 'done' ||
        appointment.status === 'in-progress' ||
        appointment.status === 'checked-in',
    ).length;
    const pending = today.filter((appointment) => appointment.status === 'booked').length;
    const noShow = today.filter((appointment) => appointment.status === 'no-show').length;
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0;
    const activePatients = this.patients().filter((patient) => patient.active).length;
    return [
      {
        key: 'active',
        label: 'Pacientes activos',
        value: String(activePatients || this.patients().length),
        hint: 'En seguimiento',
        tone: 'brand',
      },
      {
        key: 'today',
        label: 'Citas de hoy',
        value: String(total),
        hint: `${pending} pendientes`,
        tone: 'success',
      },
      {
        key: 'attendance',
        label: 'Tasa de asistencia',
        value: `${attendanceRate}%`,
        hint: `${attended} de ${total}`,
        tone: attendanceRate >= 80 ? 'success' : 'warning',
      },
      {
        key: 'noshow',
        label: 'Inasistencias',
        value: String(noShow),
        hint: 'Hoy',
        tone: noShow > 0 ? 'danger' : 'success',
      },
    ];
  });

  readonly alerts = computed<readonly ClinicalAlert[]>(() => {
    const alerts: ClinicalAlert[] = [];
    for (const patient of this.patients()) {
      if (patient.allergies.length > 0) {
        alerts.push({
          id: `allergy-${patient.id}`,
          severity: 'warning',
          title: `Alergia registrada · ${patient.name}`,
          detail: patient.allergies.join(', '),
        });
      }
    }
    const noShow = this.todaysAppointments().filter(
      (appointment) => appointment.status === 'no-show',
    );
    for (const appointment of noShow) {
      alerts.push({
        id: `noshow-${appointment.id}`,
        severity: 'danger',
        title: `Inasistencia · ${appointment.patientName}`,
        detail: `${appointment.time} — ${appointment.reason}. Reprogramar.`,
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        id: 'all-clear',
        severity: 'info',
        title: 'Sin alertas críticas',
        detail: 'No hay interacciones ni inasistencias pendientes.',
      });
    }
    return alerts;
  });

  // ─── Agenda derived ────────────────────────────────────────────────────────────
  readonly filteredAppointments = computed(() => {
    const doctorId = this.agendaDoctorFilter();
    const list = this.appointments();
    const scoped = doctorId
      ? list.filter((appointment) => appointment.doctorId === doctorId)
      : list;
    return [...scoped].sort((a, b) => a.time.localeCompare(b.time));
  });

  // ─── Chart derived ─────────────────────────────────────────────────────────────
  readonly latestVitals = computed<Vitals | null>(() => {
    const encounters = this.chart()?.encounters ?? [];
    return encounters.length > 0 ? encounters[0].soap.objective : null;
  });

  /** Weight + systolic trend series for the evolution view (from encounters). */
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
        points: encounters.map((encounter) => ({
          date: encounter.date,
          value: encounter.soap.objective.systolic,
        })),
      },
      {
        key: 'weight',
        label: 'Peso',
        unit: 'kg',
        points: encounters.map((encounter) => ({
          date: encounter.date,
          value: encounter.soap.objective.weight,
        })),
      },
      {
        key: 'glucose',
        label: 'Glucosa',
        unit: 'mg/dL',
        points: encounters.map((encounter) => ({
          date: encounter.date,
          value: encounter.soap.objective.glucose,
        })),
      },
    ];
  });

  // ─── Encounter validity ──────────────────────────────────────────────────────
  readonly soapValid = computed(
    () => this.soapSubjective().trim().length > 3 && this.soapAssessment().trim().length > 3,
  );

  readonly rxItemValid = computed(
    () => this.rxDrug().trim().length > 1 && this.rxDose().trim().length > 0,
  );

  readonly bookValid = computed(
    () =>
      this.bookDoctorId().trim().length > 0 &&
      this.bookPatientId().trim().length > 0 &&
      this.bookDate().trim().length > 0 &&
      this.bookTime().trim().length > 0,
  );

  constructor() {
    // Apply the initial role from config (flat alias wins, then object, then default).
    const initialRole =
      coerceRole(this.roleInput()) ?? this.config()?.role ?? DEFAULT_ROLE;
    this.role.set(initialRole);
    // Open the EHR with the clinical dashboard populated.
    void this.loadDashboard();
  }

  // ─── Native input binding helper ─────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) =>
      setter((event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '');
  }

  // ─── Navigation ────────────────────────────────────────────────────────────
  go(view: EhrView): void {
    this.view.set(view);
    this.navOpen.set(false);
    this.errorMessage.set('');
    this.viewchange.emit(view);
    if (view === 'patients' && !this.patientsLoaded()) {
      void this.loadPatients();
    } else if (view === 'doctors' && !this.doctorsLoaded()) {
      void this.loadDoctors();
    } else if (view === 'appointments' && !this.appointmentsLoaded()) {
      void this.loadAppointments();
    } else if (view === 'prescriptions') {
      void this.ensureDoctors();
    }
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  setRole(role: EhrRole): void {
    this.role.set(role);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  private async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const [patients, appointments, doctors] = await Promise.all([
        this.#api.patients(this.apiBase(), ''),
        this.#api.appointments(this.apiBase(), new Date().toISOString().slice(0, 10)),
        this.#api.doctors(this.apiBase()),
      ]);
      this.patients.set(patients);
      this.patientsLoaded.set(true);
      this.appointments.set(appointments);
      this.appointmentsLoaded.set(true);
      this.doctors.set(doctors);
      this.doctorsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el tablero clínico. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Patients ──────────────────────────────────────────────────────────────
  submitGlobalSearch(): void {
    this.patientQuery.set(this.globalSearch().trim());
    this.go('patients');
    void this.loadPatients();
  }

  submitPatientSearch(): void {
    void this.loadPatients();
  }

  private async loadPatients(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const patients = await this.#api.patients(this.apiBase(), this.patientQuery());
      this.patients.set(patients);
      this.patientsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los pacientes. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Doctors ───────────────────────────────────────────────────────────────
  private async ensureDoctors(): Promise<void> {
    if (this.doctorsLoaded()) {
      return;
    }
    await this.loadDoctors();
  }

  private async loadDoctors(): Promise<void> {
    this.loading.set(true);
    try {
      const doctors = await this.#api.doctors(this.apiBase());
      this.doctors.set(doctors);
      this.doctorsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el directorio de médicos.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  doctorName(doctorId: string): string {
    return this.doctors().find((doctor) => doctor.id === doctorId)?.name ?? '—';
  }

  // ─── Patient chart ─────────────────────────────────────────────────────────
  openPatient(patient: Patient): void {
    void this.loadChart(patient.id);
  }

  backToPatients(): void {
    this.view.set('patients');
    this.chart.set(null);
    this.errorMessage.set('');
    this.viewchange.emit('patients');
  }

  setChartTab(tab: ChartTab): void {
    this.chartTab.set(tab);
  }

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
      this.errorMessage.set('No pudimos abrir la ficha del paciente. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Encounter (SOAP) ──────────────────────────────────────────────────────
  startEncounter(): void {
    if (!this.chart() || !this.canClinicalWrite()) {
      return;
    }
    this.resetEncounterDraft();
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
    // Optimistic: prepend the encounter to the chart immediately.
    this.applyEncounter(chart, optimistic);
    this.loading.set(true);
    try {
      const saved = await this.#api.saveEncounter(this.apiBase(), { patientId, soap }, optimistic);
      // Reconcile the optimistic entry with the server's authoritative record.
      this.replaceEncounter(optimistic.id, saved);
      // Persist a prescription too if the clinician composed one in this visit.
      if (this.rxItems().length > 0) {
        await this.persistPrescription(patientId);
      }
      this.encountersaved.emit({ patientId, encounterId: saved.id });
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
    this.chart.set({
      ...chart,
      history: swap(chart.history),
      encounters: swap(chart.encounters),
    });
  }

  // ─── Prescriptions ─────────────────────────────────────────────────────────
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

  /** Detect naive drug–allergy interactions against the active patient. */
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

  // ─── Appointments / agenda ─────────────────────────────────────────────────
  setAgendaDate(value: string): void {
    this.agendaDate.set(value);
    void this.loadAppointments();
  }

  setAgendaDoctorFilter(value: string): void {
    this.agendaDoctorFilter.set(value);
  }

  private async loadAppointments(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.ensureDoctors();
      const appointments = await this.#api.appointments(this.apiBase(), this.agendaDate());
      this.appointments.set(appointments);
      this.appointmentsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar la agenda. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  async bookAppointment(): Promise<void> {
    if (!this.bookValid() || !this.canSchedule() || this.loading()) {
      return;
    }
    const patient = this.patients().find((entry) => entry.id === this.bookPatientId());
    const doctor = this.doctors().find((entry) => entry.id === this.bookDoctorId());
    const optimistic: Appointment = {
      id: `AP-${Date.now().toString(36)}`,
      patientId: this.bookPatientId(),
      patientName: patient?.name ?? 'Paciente',
      doctorId: this.bookDoctorId(),
      doctorName: doctor?.name ?? 'Médico',
      date: this.bookDate(),
      time: this.bookTime(),
      durationMin: 30,
      reason: this.bookReason().trim() || 'Consulta',
      status: 'booked',
    };
    // Optimistic: show the slot on the agenda immediately.
    this.appointments.update((list) => [...list, optimistic]);
    this.loading.set(true);
    try {
      const saved = await this.#api.bookAppointment(
        this.apiBase(),
        {
          patientId: optimistic.patientId,
          doctorId: optimistic.doctorId,
          slot: { date: optimistic.date, time: optimistic.time },
        },
        optimistic,
      );
      this.appointments.update((list) =>
        list.map((appointment) => (appointment.id === optimistic.id ? saved : appointment)),
      );
      this.appointmentbooked.emit({ appointmentId: saved.id, patientId: saved.patientId });
      this.resetBookingDraft();
    } catch (error) {
      this.errorMessage.set('No pudimos agendar la cita. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  private resetBookingDraft(): void {
    this.bookDoctorId.set('');
    this.bookPatientId.set('');
    this.bookReason.set('');
    this.bookTime.set('08:00');
  }

  // ─── Display helpers ────────────────────────────────────────────────────────
  appointmentStatusLabel(status: AppointmentStatus): string {
    switch (status) {
      case 'booked':
        return 'Agendada';
      case 'checked-in':
        return 'En recepción';
      case 'in-progress':
        return 'En consulta';
      case 'done':
        return 'Atendida';
      case 'no-show':
        return 'No asistió';
      case 'cancelled':
        return 'Cancelada';
    }
  }

  appointmentStatusTone(status: AppointmentStatus): string {
    switch (status) {
      case 'done':
      case 'in-progress':
      case 'checked-in':
        return 'success';
      case 'no-show':
      case 'cancelled':
        return 'danger';
      default:
        return 'neutral';
    }
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

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  /** Bar height % for a point within its series (evolution chart). */
  pointHeight(series: EvolutionSeries, value: number): number {
    const values = series.points.map((point) => point.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    // Floor at 8% so a flat series still shows visible bars.
    return Math.round(8 + ((value - min) / span) * 92);
  }

  bloodPressureLabel(vitals: Vitals): string {
    return `${vitals.systolic}/${vitals.diastolic}`;
  }

  hasVitals(vitals: Vitals): boolean {
    return vitals !== EMPTY_VITALS && (vitals.systolic > 0 || vitals.weight > 0);
  }

  private toNumber(value: string): number {
    const parsed = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
  }
}
