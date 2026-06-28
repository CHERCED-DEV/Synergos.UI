/**
 * Domain model for the Healthcare vertical's <c>&lt;synergos-ehr&gt;</c> — an EHR-lite
 * clinical dashboard (practice-management + chart) styled after AdvancedMD / RXNT /
 * PracticeEHR.
 *
 * Unlike the transactional verticals, the EHR core is an **admin panel**: rich CRUD
 * over patients, providers, appointments, encounters (SOAP notes) and prescriptions.
 * The appointment booking sub-flow is the only place that would reuse the shared
 * transaction engine (copago / fee); these types describe the clinical domain only.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

/** Demo RBAC roles — drives the topbar role-switcher and view permissions. */
export type EhrRole = 'admin' | 'doctor' | 'nurse';

/** The high-level view / route the EHR shell is in. */
export type EhrView =
  | 'dashboard'
  | 'patients'
  | 'chart'
  | 'encounter'
  | 'prescriptions'
  | 'doctors'
  | 'appointments';

/** Tabs inside the patient chart snapshot. */
export type ChartTab =
  | 'summary'
  | 'history'
  | 'evolution'
  | 'prescriptions'
  | 'appointments';

/** Coarse status of an appointment slot (booking → care lifecycle). */
export type AppointmentStatus =
  | 'booked'
  | 'checked-in'
  | 'in-progress'
  | 'done'
  | 'no-show'
  | 'cancelled';

/** Severity of a clinical alert (drug interaction / allergy / overdue task). */
export type AlertSeverity = 'info' | 'warning' | 'danger';

/** Biological sex recorded in demographics. */
export type PatientSex = 'F' | 'M' | 'X';

// ─── Core entities ─────────────────────────────────────────────────────────────

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
  /** Known allergies — flagged prominently in the chart. */
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
  /** Systolic blood pressure (mmHg). */
  readonly systolic: number;
  /** Diastolic blood pressure (mmHg). */
  readonly diastolic: number;
  /** Heart rate (bpm). */
  readonly heartRate: number;
  /** Temperature (°C). */
  readonly temperature: number;
  /** Weight (kg). */
  readonly weight: number;
  /** Height (cm). */
  readonly height: number;
  /** Capillary glucose (mg/dL). */
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

// ─── Aggregates / dashboard ────────────────────────────────────────────────────

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

/** A dashboard KPI tile. */
export interface KpiTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Optional sub-caption (trend / context). */
  readonly hint: string;
  /** Drives the accent color of the tile. */
  readonly tone: 'brand' | 'success' | 'warning' | 'danger';
}

/** A clinical alert surfaced on the dashboard. */
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

// ─── API response shapes (mirror the backend contract) ─────────────────────────

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
