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
 * the API — and a read that fails leaves a gap with the error in view, never another
 * patient's record (#106) —, every label/copy comes from the shell config.
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

/**
 * The reads this app makes, as addressable names.
 *
 * A clinical read that FAILS leaves its signal at its pristine value, which on its
 * own is indistinguishable from «the server answered, and there is nothing». The
 * view has to tell the two apart, so the container records which reads failed and
 * the template asks by name.
 */
export type EhrDataset =
  | 'home'
  | 'appointments'
  | 'results'
  | 'medications'
  | 'health'
  | 'billing'
  | 'threads'
  | 'board'
  | 'patients'
  | 'inbox'
  | 'chart'
  | 'doctors';

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
  /**
   * Episodio de atención abierto. **`null` = no consta** — el borde dejó de
   * afirmarlo (#111) y el normalizador lo reponía a `true`, que es la afirmación
   * contraria a la que más importa: un paciente inactivo tratado como activo.
   */
  readonly active: boolean | null;
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
  /**
   * Si acepta pacientes nuevos. **`null` = no consta**, y no «sí» (#111): un `true`
   * repuesto por el cliente manda a alguien a pedir cita donde no se la van a dar.
   */
  readonly acceptingPatients: boolean | null;
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
  /**
   * Mensajes sin leer, o `null` cuando **no consta** — y `null` no es `0` (CMS#116).
   *
   * Mismo tipo y misma razón que `MessageThread.unread`: el borde no tiene
   * read-receipts, así que no hay cifra que emitir. Con `number` a secas el
   * normalizador reponía `0` con la clave ausente, o sea afirmaba «no tienes nada sin
   * leer» por su cuenta — la mitad del defecto que vive de ESTE lado de la red.
   */
  readonly unreadMessages: number | null;
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
  /** Farmacia donde se dispensa. **`null` = no consta**, y la ficha lo omite (#111). */
  readonly pharmacy: string | null;
  readonly refillsLeft: number;
  readonly refillStatus: RefillStatus | null;
}

/** Where a preventive-care / immunization item stands. `null` = **no consta**. */
export type CareStatus = 'complete' | 'due' | 'overdue';

/** A verifiable immunization record on the health summary. */
export interface Immunization {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly status: CareStatus;
}

/**
 * A preventive-care recommendation on the health maintenance panel.
 *
 * `status` is **nullable on purpose**: the recommendation itself derives from real
 * data (age + sex), but whether the person already had it done needs a seam that
 * does not exist. `null` means *no consta* — never render it as «al día».
 */
export interface HealthMaintenanceItem {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly status: CareStatus | null;
  readonly dueDate: string;
}

/**
 * `GET /api/ehr/health?patient=` — the health record aggregate.
 *
 * `immunizations` is `readonly Immunization[] | null`, and the difference is the
 * whole point: `[]` says «this person has no vaccines recorded»; `null` says
 * «there is no vaccination registry to read». The backend stopped emitting the key
 * (CHERCED-DEV/Synergos.CMS#106) because there is no immunization seam — an empty
 * list there would be the UI asserting a clinical fact nobody established.
 */
export interface HealthSummary {
  readonly conditions: readonly string[];
  readonly allergies: readonly string[];
  readonly immunizations: readonly Immunization[] | null;
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
  /**
   * `true` sólo cuando el envío **no llegó al servidor** (#111). Ausente es lo
   * normal: lo que viene del servidor está, por definición, entregado.
   *
   * El mensaje se queda en el hilo en vez de desaparecer —lo tecleado no se
   * pierde— pero **marcado**: una burbuja sin marca es un acuse, y aquí no hay
   * nada que acusar. Se reintenta desde ahí.
   */
  readonly failed?: boolean;
}

/** A bidirectional conversation between the patient and the care team. */
export interface MessageThread {
  readonly id: string;
  /** The other party's display name (care team ↔ patient). */
  readonly participant: string;
  readonly subject: string;
  readonly lastMessage: string;
  readonly lastAtUtc: string;
  /**
   * Mensajes sin leer. **`null` = no lo sabemos**, que NO es cero (#111).
   *
   * El normalizador lo reponía a `0` y la insignia sólo se pinta con `> 0`, así que
   * «no lo sabemos» se veía exactamente igual que «no tienes nada sin leer» — que es
   * lo que hace que alguien no abra el mensaje de su médico. Es la regla 15: la
   * ausencia tiene que verse distinta de la afirmación.
   */
  readonly unread: number | null;
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
  /**
   * Base del borde clínico, para que `confirm` pueda RESERVAR de verdad (#111).
   *
   * Viaja con la selección porque `IFulfillmentStrategy.confirm(session)` sólo
   * recibe la sesión: el instrumento es del paso de pago, y la reserva ocurre
   * después. Es la misma costura por la que `Bff.*` pasa `apiBase` en el
   * instrumento de `pay`.
   */
  readonly apiBase: string;
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
