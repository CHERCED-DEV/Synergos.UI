/**
 * Domain model for the Healthcare vertical's <c>&lt;synergos-ehr&gt;</c> — **v2**: a
 * two-portal clinical app styled after **Epic** (MyChart patient portal + Hyperspace
 * EHR cockpit), doc 21 §2.5 + `deep-research/healthcare.md`.
 *
 * The two portals are **two views of the same clinical graph**: a refill the patient
 * requests lands in the clinician In Basket; the AVS that closes an encounter shows up
 * in the patient's Visits. This file describes that graph.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 * 100% composable: nothing here is siteRoot-specific — every clinical fact comes from
 * the API (with visible mock degradation), every label/copy comes from the shell config.
 */

// ─── Role & routing (dual portal, role-switch) ───────────────────────────────────

/** The two portals of the same graph + the demo clinician sub-role. */
export type EhrPortal = 'patient' | 'clinician';

/**
 * Demo RBAC role — drives the topbar role-switcher and gates write actions.
 * `patient` sees MyChart; `doctor`/`nurse` see the clinical cockpit (write-capable).
 */
export type EhrRole = 'patient' | 'doctor' | 'nurse';

/** The high-level view / route the app is in (both portals, one hash router). */
export type EhrView =
  // Patient (MyChart)
  | 'home'
  | 'visits'
  | 'schedule'
  | 'echeckin'
  | 'messages'
  | 'results'
  | 'medications'
  | 'health'
  | 'billing'
  // Clinician (Hyperspace)
  | 'board'
  | 'patients'
  | 'inbasket'
  | 'chart'
  | 'encounter';

/** Tabs inside the clinician patient-chart workspace. */
export type ChartTab = 'summary' | 'history' | 'results' | 'medications' | 'evolution';

/** Tabs inside the patient health-summary view. */
export type HealthTab = 'conditions' | 'allergies' | 'immunizations' | 'maintenance';

/** Coarse status of an appointment slot (booking → care lifecycle). */
export type AppointmentStatus =
  | 'booked'
  | 'checked-in'
  | 'in-progress'
  | 'done'
  | 'no-show'
  | 'cancelled';

/** Schedule-board state (Epic: scheduled/arrived/roomed/in-visit/checked-out). */
export type ScheduleState = 'scheduled' | 'arrived' | 'roomed' | 'in-visit' | 'checked-out' | 'no-show';

/** Severity of a clinical alert (drug interaction / allergy / overdue task). */
export type AlertSeverity = 'info' | 'warning' | 'danger';

/** Biological sex recorded in demographics. */
export type PatientSex = 'F' | 'M' | 'X';

/** Lab result flag against the reference range. */
export type ResultFlag = 'normal' | 'high' | 'low' | 'critical';

/** In Basket message type (discriminator + routing, doc 21 §2.5 SH-7 v3). */
export type InboxKind = 'result' | 'refill' | 'advice' | 'cosign';

/** Refill request lifecycle. */
export type RefillStatus = 'requested' | 'approved' | 'denied';

// ─── Core clinical entities (stable — the api-client normalisers depend on these) ─

/** A patient summary row for the list + the chart header. */
export interface Patient {
  readonly id: string;
  readonly name: string;
  /** National document / MRN. */
  readonly document: string;
  readonly sex: PatientSex;
  /** Age in years (precomputed for display). */
  readonly age: number;
  readonly phone: string;
  readonly email: string;
  /** Blood type (e.g. `O+`), shown in the demographic header. */
  readonly bloodType: string;
  /** Active problem list (chronic conditions / diagnoses). */
  readonly problems: readonly string[];
  /** Known allergies — flagged prominently in the chart / Storyboard. */
  readonly allergies: readonly string[];
  /** Id of the patient's primary care provider. */
  readonly primaryDoctorId: string;
  /** True while the patient has an open / active care episode. */
  readonly active: boolean;
}

/** A provider / doctor in the directory. */
export interface Doctor {
  readonly id: string;
  readonly name: string;
  readonly specialty: string;
  /** License / registration number. */
  readonly license: string;
  readonly phone: string;
  readonly email: string;
  /** Whether the provider currently accepts new appointments. */
  readonly acceptingPatients: boolean;
  /** Average patient rating 0–5 (directory badge). */
  readonly rating: number;
}

/** One scheduled appointment block on the agenda. */
export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  readonly patientName: string;
  readonly doctorId: string;
  readonly doctorName: string;
  /** ISO date `YYYY-MM-DD`. */
  readonly date: string;
  /** Start time `HH:mm` (24h). */
  readonly time: string;
  /** Duration in minutes. */
  readonly durationMin: number;
  readonly reason: string;
  readonly status: AppointmentStatus;
}

/** A single set of vital signs measured during an encounter (the SOAP Objective). */
export interface Vitals {
  readonly systolic: number;
  readonly diastolic: number;
  readonly heartRate: number;
  readonly temperature: number;
  readonly weight: number;
  readonly height: number;
  readonly glucose: number;
}

/** The four sections of a clinical SOAP note. */
export interface SoapNote {
  readonly subjective: string;
  readonly objective: Vitals;
  readonly assessment: string;
  readonly plan: string;
}

/** A clinical encounter (consultation) recorded against a patient. */
export interface Encounter {
  readonly id: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly doctorName: string;
  /** ISO date `YYYY-MM-DD`. */
  readonly date: string;
  readonly reason: string;
  readonly soap: SoapNote;
  /** Clinician signature (data-URL or initials) — empty until signed. */
  readonly signature: string;
}

/** One medication line in a prescription. */
export interface PrescriptionItem {
  readonly drug: string;
  readonly dose: string;
  readonly frequency: string;
  readonly durationDays: number;
}

/** A prescription / Rx issued for a patient. */
export interface Prescription {
  readonly id: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly doctorName: string;
  /** ISO date `YYYY-MM-DD`. */
  readonly date: string;
  readonly items: readonly PrescriptionItem[];
  /** Detected drug–drug / drug–allergy interactions (flag banner). */
  readonly interactions: readonly string[];
}

/** The full patient chart payload — `GET /api/ehr/patient/{id}`. */
export interface PatientChart {
  readonly patient: Patient;
  /** Past encounters (clinical history), newest first. */
  readonly history: readonly Encounter[];
  /** Alias used by the evolution timeline (== history). */
  readonly encounters: readonly Encounter[];
  readonly prescriptions: readonly Prescription[];
  readonly appointments: readonly Appointment[];
}

// ─── Shared display aggregates ───────────────────────────────────────────────────

/** A dashboard KPI tile (clinician cockpit). */
export interface KpiTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly tone: 'brand' | 'success' | 'warning' | 'danger';
}

/** A clinical alert surfaced on the dashboard / Storyboard. */
export interface ClinicalAlert {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly detail: string;
}

/** A single measure point for the evolution chart (e.g. weight over time). */
export interface EvolutionPoint {
  readonly date: string;
  readonly value: number;
}

/** A measure series rendered on the evolution view. */
export interface EvolutionSeries {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly points: readonly EvolutionPoint[];
}

// ─── PATIENT PORTAL (MyChart) ────────────────────────────────────────────────────

/** One card in the patient home feed (próxima cita, pendientes, resultados…). */
export interface HomeCard {
  readonly id: string;
  readonly kind: 'appointment' | 'result' | 'message' | 'balance' | 'reminder' | 'checkin';
  readonly title: string;
  readonly detail: string;
  /** Optional deep-link target view. */
  readonly action?: EhrView;
  readonly actionLabel?: string;
  readonly tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}

/** `GET /api/ehr/portal/home?patient=` payload. */
export interface PortalHome {
  readonly patient: Patient;
  readonly cards: readonly HomeCard[];
  readonly nextAppointment: Appointment | null;
  readonly balanceMinor: number;
  readonly currency: string;
  readonly unreadMessages: number;
  readonly pendingCheckins: number;
}

/** One lab result row (value + reference range + flag). */
export interface LabResult {
  readonly id: string;
  readonly patientId: string;
  readonly name: string;
  readonly panel: string;
  readonly value: number;
  readonly unit: string;
  readonly refLow: number;
  readonly refHigh: number;
  readonly flag: ResultFlag;
  /** ISO date `YYYY-MM-DD` the specimen was resulted. */
  readonly date: string;
  readonly comment: string;
  /** Whether the clinician has released it to the patient portal. */
  readonly released: boolean;
}

/** An active medication with refill affordance. */
export interface Medication {
  readonly id: string;
  readonly patientId: string;
  readonly drug: string;
  readonly dose: string;
  readonly frequency: string;
  readonly instructions: string;
  readonly pharmacy: string;
  readonly refillsLeft: number;
  readonly refillStatus: RefillStatus | null;
}

/** A verifiable immunization record on the health summary. */
export interface Immunization {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly status: 'complete' | 'due' | 'overdue';
}

/** A preventive-care gap on the health maintenance panel. */
export interface HealthMaintenanceItem {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly status: 'complete' | 'due' | 'overdue';
  readonly dueDate: string;
}

/** `GET /api/ehr/results?patient=` (patient) — the health record aggregate. */
export interface HealthSummary {
  readonly conditions: readonly string[];
  readonly allergies: readonly string[];
  readonly immunizations: readonly Immunization[];
  readonly maintenance: readonly HealthMaintenanceItem[];
}

/** One line on a patient statement. */
export interface StatementLine {
  readonly id: string;
  readonly date: string;
  readonly description: string;
  readonly amountMinor: number;
}

/** `GET /api/ehr/billing?patient=` payload. */
export interface BillingStatement {
  readonly patientId: string;
  readonly currency: string;
  readonly balanceMinor: number;
  readonly lines: readonly StatementLine[];
  /** Whether a payment plan is already active. */
  readonly planActive: boolean;
}

// ─── MESSAGING / IN BASKET (shared graph, SH-7) ──────────────────────────────────

/** One message inside a thread. */
export interface ClinicalMessage {
  readonly id: string;
  readonly threadId: string;
  readonly author: string;
  readonly body: string;
  readonly createdAtUtc: string;
  /** True when sent by the current viewer (right-aligned bubble). */
  readonly outgoing: boolean;
}

/** A bidirectional conversation between the patient and the care team. */
export interface MessageThread {
  readonly id: string;
  /** The other party's display name (care team ↔ patient). */
  readonly participant: string;
  readonly subject: string;
  readonly lastMessage: string;
  readonly lastAtUtc: string;
  readonly unread: number;
  readonly messages: readonly ClinicalMessage[];
}

/**
 * One In Basket item on the clinician side (results/refills/advice/cosign). The
 * discriminator + routing is the SH-7 v3 shape — one provider, typed rows.
 */
export interface InboxItem {
  readonly id: string;
  readonly kind: InboxKind;
  readonly patientId: string;
  readonly patientName: string;
  readonly title: string;
  readonly detail: string;
  readonly createdAtUtc: string;
  readonly priority: 'routine' | 'high';
  readonly done: boolean;
}

// ─── CLINICIAN PORTAL (Hyperspace) ───────────────────────────────────────────────

/** One slot on the clinician schedule board (with the arrival state machine). */
export interface ScheduleSlot {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly patientName: string;
  readonly doctorId: string;
  readonly doctorName: string;
  readonly time: string;
  readonly durationMin: number;
  readonly reason: string;
  readonly type: 'in-person' | 'video';
  readonly state: ScheduleState;
  /** Whether the patient completed e-Check-In ahead of the visit. */
  readonly checkedInAhead: boolean;
}

// ─── Tracking (SH-4 tracking-timeline) ───────────────────────────────────────────

/** A tracking stage rendered by `syn-tracking-timeline` (order/visit/refill state). */
export interface TrackStage {
  readonly id: string;
  readonly label: string;
  readonly date?: string;
  readonly description?: string;
  readonly state: 'done' | 'current' | 'pending';
}

// ─── Engine wiring (appointment scheduling as a reservable resource) ──────────────

/** A bookable slot (recurso reservable = médico + fecha/hora). */
export interface AppointmentSlot {
  readonly date: string;
  readonly time: string;
}

/** Payload the schedule wizard hands the fulfillment strategy on `select`. */
export interface AppointmentSelectionPayload {
  readonly patientId: string;
  readonly patientName: string;
  readonly doctorId: string;
  readonly doctorName: string;
  readonly slot: AppointmentSlot;
  readonly reason: string;
  readonly mode: 'in-person' | 'video';
  /** Copay in minor units (0 = pago OFF for this visit type). */
  readonly copayMinor: number;
}

// ─── API response shapes (mirror the backend contract) ───────────────────────────

/** `GET /api/ehr/patients?q=` → `{ patients }`. */
export interface PatientsResponse {
  readonly patients: readonly Patient[];
}

/** `GET /api/ehr/doctors` → `{ doctors }`. */
export interface DoctorsResponse {
  readonly doctors: readonly Doctor[];
}

/** `GET /api/ehr/appointments?date=` → `{ appointments }`. */
export interface AppointmentsResponse {
  readonly appointments: readonly Appointment[];
}
