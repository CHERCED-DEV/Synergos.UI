import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type Appointment,
  type AppointmentStatus,
  type BillingStatement,
  type CareStatus,
  type Doctor,
  type Encounter,
  type HealthSummary,
  type InboxItem,
  type LabResult,
  type Medication,
  type MessageThread,
  type Patient,
  type PatientChart,
  type PatientSex,
  type PortalHome,
  type Prescription,
  type PrescriptionItem,
  type RefillStatus,
  type ScheduleSlot,
  type SoapNote,
  type Vitals,
} from './ehr.model';

/**
 * A clinical read that could not be served. Carries the endpoint so the caller can
 * log it; the caller turns it into an empty view plus a visible notice.
 */
export class EhrUnavailableError extends Error {
  constructor(readonly endpoint: string, override readonly cause: unknown) {
    super(`EHR read "${endpoint}" unavailable.`);
    this.name = 'EhrUnavailableError';
  }
}

/**
 * Thin HTTP client over the Healthcare EHR backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/ehr/patients?q=`            → `{ patients }`
 *  - `GET  /api/ehr/patient/{id}`           → `{ patient, history, encounters, prescriptions, appointments }`
 *  - `GET  /api/ehr/doctors`                → `{ doctors }`
 *  - `GET  /api/ehr/appointments?date=`     → `{ appointments }`
 *  - `POST /api/ehr/appointment` `{ patientId, doctorId, slot }`  → `{ appointment }`
 *  - `POST /api/ehr/encounter`   `{ patientId, soap }`            → `{ encounter }`
 *  - `POST /api/ehr/prescription``{ patientId, items }`           → `{ prescription }`
 *
 * **v2 (dual-portal):**
 *  - `GET  /api/ehr/portal/home?patient=`   → `{ patient, cards, nextAppointment, … }`
 *  - `GET  /api/ehr/results?patient=`       → `{ results }`
 *  - `GET  /api/ehr/medications?patient=`   → `{ medications }`
 *  - `POST /api/ehr/refill` `{ medicationId, patientId }` → `{ status }`
 *  - `GET  /api/ehr/messages?user=`         → `{ threads }`
 *  - `POST /api/ehr/message` `{ threadId, body }`        → `{ message }`
 *  - `GET  /api/ehr/inbasket?provider=`     → `{ items }`
 *  - `POST /api/ehr/order` `{ patientId, kind, detail }` → `{ ok }`  (stub)
 *  - `GET  /api/ehr/billing?patient=`       → `{ statement }`
 *  - `GET  /api/ehr/schedule?date=`         → `{ slots }` (falls back to appointments)
 *
 * **A failed clinical read throws. It does NOT degrade** (CHERCED-DEV/Synergos.CMS#106).
 *
 * This client used to answer a 404 with seeded demo data, and `mockChart(id)` accepted
 * ANY id and returned patient zero — María González's tensions, glycaemias, diagnoses
 * and prescriptions, filed under the id that was asked for. `EhrController` is
 * `[DevSeedOnly]`, so outside development all 18 endpoints 404 and that is exactly the
 * branch that ran: open patient B's chart, read patient A's record with B's name on top.
 *
 * The seeded demo graph still exists — **on the server**, keyed by real patient ids
 * (`Synergos:DevSeed:Enabled=true`). Keeping a second copy here was what let the two
 * diverge, and what would have survived the day a real EHR adapter landed behind the
 * same `catch`: an outage would keep filling in allergies. An allergy list is what
 * someone decides a prescription against, so the only honest answer to «no lo pude
 * leer» is nothing at all, said out loud.
 *
 * Writes still take a caller-supplied optimistic `fallback` — that is a separate
 * defect of the same family (rule 4 / rule 9) and is deliberately out of this change.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class EhrApiClient {
  readonly #logger = inject(LoggerService);

  // ─── Patients ──────────────────────────────────────────────────────────────

  async patients(apiBase: string, query: string): Promise<readonly Patient[]> {
    const q = query.trim();
    const url = `${apiBase}/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    try {
      const data = await this.getJson(url);
      const patients = normalizePatients(data);
      if (patients) {
        return patients;
      }
      throw new Error('patients-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/patients', error);
    }
  }

  async patientChart(apiBase: string, id: string): Promise<PatientChart> {
    const url = `${apiBase}/patient/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const chart = normalizeChart(data);
      if (chart) {
        return chart;
      }
      throw new Error('chart-shape');
    } catch (error) {
      // #106: `mockChart(id)` answered ANY id with patient zero's record filed under
      // the id that was asked for. There is no safe fallback for a clinical chart.
      this.unavailable('GET /api/ehr/patient/{id}', error);
    }
  }

  // ─── Doctors ───────────────────────────────────────────────────────────────

  async doctors(apiBase: string): Promise<readonly Doctor[]> {
    const url = `${apiBase}/doctors`;
    try {
      const data = await this.getJson(url);
      const doctors = normalizeDoctors(data);
      if (doctors) {
        return doctors;
      }
      throw new Error('doctors-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/doctors', error);
    }
  }

  // ─── Appointments ──────────────────────────────────────────────────────────

  async appointments(apiBase: string, date: string): Promise<readonly Appointment[]> {
    const url = `${apiBase}/appointments${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    try {
      const data = await this.getJson(url);
      const appointments = normalizeAppointments(data);
      if (appointments) {
        return appointments;
      }
      throw new Error('appointments-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/appointments', error);
    }
  }

  /** `POST /api/ehr/appointment` — books a slot (optimistic on the caller side). */
  async bookAppointment(
    apiBase: string,
    body: { patientId: string; doctorId: string; slot: { date: string; time: string } },
    fallback: Appointment,
  ): Promise<Appointment> {
    const url = `${apiBase}/appointment`;
    try {
      const data = await this.postJson(url, body);
      const appointment = normalizeAppointment(pluck(data, 'appointment') ?? data);
      if (appointment) {
        return appointment;
      }
      throw new Error('appointment-shape');
    } catch (error) {
      this.logWriteFallback('POST /api/ehr/appointment', error);
      return fallback;
    }
  }

  /** `POST /api/ehr/encounter` — saves a SOAP note (optimistic on the caller side). */
  async saveEncounter(
    apiBase: string,
    body: { patientId: string; soap: SoapNote },
    fallback: Encounter,
  ): Promise<Encounter> {
    const url = `${apiBase}/encounter`;
    try {
      const data = await this.postJson(url, body);
      const encounter = normalizeEncounter(pluck(data, 'encounter') ?? data);
      if (encounter) {
        return encounter;
      }
      throw new Error('encounter-shape');
    } catch (error) {
      this.logWriteFallback('POST /api/ehr/encounter', error);
      return fallback;
    }
  }

  /** `POST /api/ehr/prescription` — issues an Rx (optimistic on the caller side). */
  async savePrescription(
    apiBase: string,
    body: { patientId: string; items: readonly PrescriptionItem[] },
    fallback: Prescription,
  ): Promise<Prescription> {
    const url = `${apiBase}/prescription`;
    try {
      const data = await this.postJson(url, body);
      const prescription = normalizePrescription(pluck(data, 'prescription') ?? data);
      if (prescription) {
        return prescription;
      }
      throw new Error('prescription-shape');
    } catch (error) {
      this.logWriteFallback('POST /api/ehr/prescription', error);
      return fallback;
    }
  }

  // ─── v2 · Patient portal (MyChart) ───────────────────────────────────────────

  /** `GET /api/ehr/portal/home?patient=` — the patient home feed aggregate. */
  async portalHome(apiBase: string, patientId: string): Promise<PortalHome> {
    const url = `${apiBase}/portal/home?patient=${encodeURIComponent(patientId)}`;
    try {
      const data = await this.getJson(url);
      const home = normalizePortalHome(data);
      if (home) {
        return home;
      }
      throw new Error('portal-home-shape');
    } catch (error) {
      // #106: the seeded home carried patient zero's `allergies` under the requested id.
      this.unavailable('GET /api/ehr/portal/home', error);
    }
  }

  /** `GET /api/ehr/results?patient=` — lab results (value + range + flag). */
  async results(apiBase: string, patientId: string): Promise<readonly LabResult[]> {
    const url = `${apiBase}/results?patient=${encodeURIComponent(patientId)}`;
    try {
      const data = await this.getJson(url);
      const results = normalizeResults(data);
      if (results) {
        return results;
      }
      throw new Error('results-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/results', error);
    }
  }

  /** `GET /api/ehr/medications?patient=` — active medications + refill affordance. */
  async medications(apiBase: string, patientId: string): Promise<readonly Medication[]> {
    const url = `${apiBase}/medications?patient=${encodeURIComponent(patientId)}`;
    try {
      const data = await this.getJson(url);
      const meds = normalizeMedications(data);
      if (meds) {
        return meds;
      }
      throw new Error('medications-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/medications', error);
    }
  }

  /** `POST /api/ehr/refill` — request a refill; returns the new status (optimistic). */
  async requestRefill(
    apiBase: string,
    body: { medicationId: string; patientId: string },
    fallback: RefillStatus,
  ): Promise<RefillStatus> {
    const url = `${apiBase}/refill`;
    try {
      const data = await this.postJson(url, body);
      const status = readString(pluck(data, 'status')).toLowerCase();
      if (status === 'requested' || status === 'approved' || status === 'denied') {
        return status;
      }
      throw new Error('refill-shape');
    } catch (error) {
      this.logWriteFallback('POST /api/ehr/refill', error);
      return fallback;
    }
  }

  /** `GET /api/ehr/health?patient=` — health summary (conditions/allergies/vaccines). */
  async healthSummary(apiBase: string, patientId: string): Promise<HealthSummary> {
    const url = `${apiBase}/health?patient=${encodeURIComponent(patientId)}`;
    try {
      const data = await this.getJson(url);
      const summary = normalizeHealthSummary(data);
      if (summary) {
        return summary;
      }
      throw new Error('health-shape');
    } catch (error) {
      // #106: `mockHealthSummary()` did not even look at the patient.
      this.unavailable('GET /api/ehr/health', error);
    }
  }

  /** `GET /api/ehr/billing?patient=` — statement + payment plan state. */
  async billing(apiBase: string, patientId: string): Promise<BillingStatement> {
    const url = `${apiBase}/billing?patient=${encodeURIComponent(patientId)}`;
    try {
      const data = await this.getJson(url);
      const statement = normalizeBilling(data);
      if (statement) {
        return statement;
      }
      throw new Error('billing-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/billing', error);
    }
  }

  // ─── v2 · Messaging / In Basket (shared graph, SH-7) ──────────────────────────

  /** `GET /api/ehr/messages?user=` — patient ↔ care-team threads. */
  async messages(apiBase: string, user: string): Promise<readonly MessageThread[]> {
    const url = `${apiBase}/messages?user=${encodeURIComponent(user)}`;
    try {
      const data = await this.getJson(url);
      const threads = normalizeThreads(data);
      if (threads) {
        return threads;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/messages', error);
    }
  }

  /** `POST /api/ehr/message` — send a message (fire-and-forget; optimistic caller). */
  async sendMessage(
    apiBase: string,
    body: { threadId: string; body: string; user: string },
  ): Promise<boolean> {
    const url = `${apiBase}/message`;
    try {
      await this.postJson(url, body);
      return true;
    } catch (error) {
      this.logWriteFallback('POST /api/ehr/message', error);
      return false;
    }
  }

  /** `GET /api/ehr/inbasket?provider=` — clinician In Basket (typed rows). */
  async inbox(apiBase: string, provider: string): Promise<readonly InboxItem[]> {
    const url = `${apiBase}/inbasket?provider=${encodeURIComponent(provider)}`;
    try {
      const data = await this.getJson(url);
      const items = normalizeInbox(data);
      if (items) {
        return items;
      }
      throw new Error('inbasket-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/inbasket', error);
    }
  }

  /** `POST /api/ehr/order` — place an order / e-Rx (stub; ok flag). */
  async placeOrder(
    apiBase: string,
    body: { patientId: string; kind: string; detail: string },
  ): Promise<boolean> {
    const url = `${apiBase}/order`;
    try {
      await this.postJson(url, body);
      return true;
    } catch (error) {
      this.logWriteFallback('POST /api/ehr/order', error);
      return false;
    }
  }

  // ─── v2 · Clinician schedule board ────────────────────────────────────────────

  /** `GET /api/ehr/schedule?date=` — the day's board with arrival states. */
  async schedule(apiBase: string, date: string): Promise<readonly ScheduleSlot[]> {
    const url = `${apiBase}/schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    try {
      const data = await this.getJson(url);
      const slots = normalizeSchedule(data);
      if (slots) {
        return slots;
      }
      throw new Error('schedule-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/schedule', error);
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(url: string): Promise<unknown> {
    return this.request(url, { method: 'GET' });
  }

  private postJson(url: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request(url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  /**
   * Log and rethrow as `EhrUnavailableError`. **Never returns a value** — the whole
   * point of #106 is that there is no plausible-looking answer to fall back to.
   */
  private unavailable(endpoint: string, error: unknown): never {
    this.#logger.warn(`EHR API "${endpoint}" unavailable — serving nothing.`, error);
    throw new EhrUnavailableError(endpoint, error);
  }

  /**
   * A WRITE that did not reach the server and answered with the caller's optimistic
   * value. This is the rule-4 lie («degradar una ESCRITURA sí miente») and it is
   * knowingly left standing by #106, whose floor is reads: every write in this app is
   * gated behind a read that succeeded (no chart → no encounter, no medication list →
   * no refill), so in the 404-everything deployment that motivated #106 none of these
   * branches is reachable. A partial outage still reaches them — that is its own ticket.
   */
  private logWriteFallback(endpoint: string, error: unknown): void {
    this.#logger.warn(`EHR API "${endpoint}" unavailable — optimistic value kept.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pluck(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

function readSex(value: unknown): PatientSex {
  const raw = readString(value).toUpperCase();
  return raw === 'F' || raw === 'M' ? raw : 'X';
}

function readStatus(value: unknown): AppointmentStatus {
  const raw = readString(value).toLowerCase();
  const known: readonly AppointmentStatus[] = [
    'booked',
    'checked-in',
    'in-progress',
    'done',
    'no-show',
    'cancelled',
  ];
  return known.includes(raw as AppointmentStatus) ? (raw as AppointmentStatus) : 'booked';
}

function normalizePatient(value: unknown): Patient | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim();
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    document: readString(value['document']).trim(),
    sex: readSex(value['sex']),
    age: Math.max(0, Math.trunc(readNumber(value['age']))),
    phone: readString(value['phone']).trim(),
    email: readString(value['email']).trim(),
    bloodType: readString(value['bloodType']).trim(),
    problems: readStringArray(value['problems']),
    allergies: readStringArray(value['allergies']),
    primaryDoctorId: readString(value['primaryDoctorId']).trim(),
    active: readBoolean(value['active'], true),
  };
}

function normalizePatients(value: unknown): readonly Patient[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'patients'))
      ? (pluck(value, 'patients') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizePatient).filter((patient): patient is Patient => patient !== null);
}

function normalizeDoctor(value: unknown): Doctor | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim();
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    specialty: readString(value['specialty']).trim(),
    license: readString(value['license']).trim(),
    phone: readString(value['phone']).trim(),
    email: readString(value['email']).trim(),
    acceptingPatients: readBoolean(value['acceptingPatients'], true),
    rating: readNumber(value['rating']),
  };
}

function normalizeDoctors(value: unknown): readonly Doctor[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'doctors'))
      ? (pluck(value, 'doctors') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeDoctor).filter((doctor): doctor is Doctor => doctor !== null);
}

function normalizeAppointment(value: unknown): Appointment | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const patientId = readString(value['patientId']).trim();
  if (!id || !patientId) {
    return null;
  }
  const slot = isRecord(value['slot']) ? value['slot'] : value;
  return {
    id,
    patientId,
    patientName: readString(value['patientName']).trim(),
    doctorId: readString(value['doctorId']).trim(),
    doctorName: readString(value['doctorName']).trim(),
    date: readString(slot['date'] ?? value['date']).trim(),
    time: readString(slot['time'] ?? value['time']).trim(),
    durationMin: Math.max(0, Math.trunc(readNumber(value['durationMin']))) || 30,
    reason: readString(value['reason']).trim(),
    status: readStatus(value['status']),
  };
}

function normalizeAppointments(value: unknown): readonly Appointment[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'appointments'))
      ? (pluck(value, 'appointments') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list
    .map(normalizeAppointment)
    .filter((appointment): appointment is Appointment => appointment !== null);
}

function normalizeVitals(value: unknown): Vitals {
  const v = isRecord(value) ? value : {};
  return {
    systolic: readNumber(v['systolic']),
    diastolic: readNumber(v['diastolic']),
    heartRate: readNumber(v['heartRate']),
    temperature: readNumber(v['temperature']),
    weight: readNumber(v['weight']),
    height: readNumber(v['height']),
    glucose: readNumber(v['glucose']),
  };
}

function normalizeSoap(value: unknown): SoapNote {
  const s = isRecord(value) ? value : {};
  return {
    subjective: readString(s['subjective']).trim(),
    objective: normalizeVitals(s['objective']),
    assessment: readString(s['assessment']).trim(),
    plan: readString(s['plan']).trim(),
  };
}

function normalizeEncounter(value: unknown): Encounter | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const patientId = readString(value['patientId']).trim();
  if (!id || !patientId) {
    return null;
  }
  return {
    id,
    patientId,
    doctorId: readString(value['doctorId']).trim(),
    doctorName: readString(value['doctorName']).trim(),
    date: readString(value['date']).trim(),
    reason: readString(value['reason']).trim(),
    soap: normalizeSoap(value['soap']),
    signature: readString(value['signature']).trim(),
  };
}

function normalizePrescriptionItem(value: unknown): PrescriptionItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const drug = readString(value['drug']).trim();
  if (!drug) {
    return null;
  }
  return {
    drug,
    dose: readString(value['dose']).trim(),
    frequency: readString(value['frequency']).trim(),
    durationDays: Math.max(0, Math.trunc(readNumber(value['durationDays']))),
  };
}

function normalizePrescription(value: unknown): Prescription | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const patientId = readString(value['patientId']).trim();
  if (!id || !patientId) {
    return null;
  }
  const rawItems = Array.isArray(value['items']) ? value['items'] : [];
  return {
    id,
    patientId,
    doctorId: readString(value['doctorId']).trim(),
    doctorName: readString(value['doctorName']).trim(),
    date: readString(value['date']).trim(),
    items: rawItems
      .map(normalizePrescriptionItem)
      .filter((item): item is PrescriptionItem => item !== null),
    interactions: readStringArray(value['interactions']),
  };
}

function normalizeChart(value: unknown): PatientChart | null {
  if (!isRecord(value)) {
    return null;
  }
  const patient = normalizePatient(value['patient'] ?? value);
  if (!patient) {
    return null;
  }
  const history = (Array.isArray(value['history']) ? value['history'] : [])
    .map(normalizeEncounter)
    .filter((encounter): encounter is Encounter => encounter !== null);
  const encounters = (Array.isArray(value['encounters']) ? value['encounters'] : [])
    .map(normalizeEncounter)
    .filter((encounter): encounter is Encounter => encounter !== null);
  const prescriptions = (Array.isArray(value['prescriptions']) ? value['prescriptions'] : [])
    .map(normalizePrescription)
    .filter((prescription): prescription is Prescription => prescription !== null);
  const appointments = (Array.isArray(value['appointments']) ? value['appointments'] : [])
    .map(normalizeAppointment)
    .filter((appointment): appointment is Appointment => appointment !== null);
  return {
    patient,
    history,
    encounters: encounters.length > 0 ? encounters : history,
    prescriptions,
    appointments,
  };
}

// ─── v2 normalisers (defensive — tolerate partial/loose API shapes) ─────────────

function readFlag(value: unknown): LabResult['flag'] {
  const raw = readString(value).toLowerCase();
  return raw === 'high' || raw === 'low' || raw === 'critical' ? raw : 'normal';
}

function normalizePortalHome(value: unknown): PortalHome | null {
  if (!isRecord(value)) {
    return null;
  }
  const patient = normalizePatient(value['patient']);
  if (!patient) {
    return null;
  }
  const rawCards = Array.isArray(value['cards']) ? value['cards'] : [];
  const cards = rawCards
    .filter(isRecord)
    .map((card) => ({
      id: readString(card['id']).trim() || `card-${Math.random().toString(36).slice(2)}`,
      kind: (readString(card['kind']).trim() || 'reminder') as PortalHome['cards'][number]['kind'],
      title: readString(card['title']).trim(),
      detail: readString(card['detail']).trim(),
      action: readString(card['action']).trim() || undefined,
      actionLabel: readString(card['actionLabel']).trim() || undefined,
      tone: (readString(card['tone']).trim() || 'neutral') as PortalHome['cards'][number]['tone'],
    }))
    .filter((card) => card.title !== '') as PortalHome['cards'];
  const next = normalizeAppointment(value['nextAppointment']);
  return {
    patient,
    cards,
    nextAppointment: next,
    balanceMinor: Math.max(0, Math.trunc(readNumber(value['balanceMinor']))),
    currency: readString(value['currency']).trim() || 'COP',
    unreadMessages: Math.max(0, Math.trunc(readNumber(value['unreadMessages']))),
    pendingCheckins: Math.max(0, Math.trunc(readNumber(value['pendingCheckins']))),
  };
}

function normalizeResult(value: unknown): LabResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim();
  if (!id || !name) {
    return null;
  }
  return {
    id,
    patientId: readString(value['patientId']).trim(),
    name,
    panel: readString(value['panel']).trim(),
    value: readNumber(value['value']),
    unit: readString(value['unit']).trim(),
    refLow: readNumber(value['refLow']),
    refHigh: readNumber(value['refHigh']),
    flag: readFlag(value['flag']),
    date: readString(value['date']).trim(),
    comment: readString(value['comment']).trim(),
    released: readBoolean(value['released'], true),
  };
}

function normalizeResults(value: unknown): readonly LabResult[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'results'))
      ? (pluck(value, 'results') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeResult).filter((entry): entry is LabResult => entry !== null);
}

function normalizeMedication(value: unknown): Medication | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const drug = readString(value['drug']).trim();
  if (!id || !drug) {
    return null;
  }
  const status = readString(value['refillStatus']).toLowerCase();
  return {
    id,
    patientId: readString(value['patientId']).trim(),
    drug,
    dose: readString(value['dose']).trim(),
    frequency: readString(value['frequency']).trim(),
    instructions: readString(value['instructions']).trim(),
    pharmacy: readString(value['pharmacy']).trim(),
    refillsLeft: Math.max(0, Math.trunc(readNumber(value['refillsLeft']))),
    refillStatus:
      status === 'requested' || status === 'approved' || status === 'denied' ? status : null,
  };
}

function normalizeMedications(value: unknown): readonly Medication[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'medications'))
      ? (pluck(value, 'medications') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeMedication).filter((entry): entry is Medication => entry !== null);
}

/** `complete` / `due` / `overdue`, or `null` when the payload does not say. */
function readCareStatus(value: unknown): CareStatus | null {
  const raw = readString(value).trim().toLowerCase();
  return raw === 'complete' || raw === 'due' || raw === 'overdue' ? raw : null;
}

function normalizeHealthSummary(value: unknown): HealthSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  // `immunizations` ABSENT and `immunizations: []` are different facts, and the
  // difference is clinical: `[]` says «no vaccines recorded for this person», absent
  // says «there is no vaccination registry». The backend stopped emitting the key
  // (#106) because the statuses were fabricated from `GetHashCode()` — randomised per
  // process, so «Influenza: al día» became «vencida» on every restart. Defaulting the
  // missing key to `[]` here would re-assert, in the UI, the same fact nobody has.
  const rawImm = value['immunizations'];
  const rawMaint = Array.isArray(value['maintenance']) ? value['maintenance'] : [];
  return {
    conditions: readStringArray(value['conditions']),
    allergies: readStringArray(value['allergies']),
    immunizations: Array.isArray(rawImm)
      ? rawImm
          .filter(isRecord)
          .map((item) => ({
            id: readString(item['id']).trim() || readString(item['name']).trim(),
            name: readString(item['name']).trim(),
            date: readString(item['date']).trim(),
            status: readCareStatus(item['status']) ?? 'due',
          }))
      : null,
    maintenance: rawMaint.filter(isRecord).map((item) => ({
      id: readString(item['id']).trim() || readString(item['name']).trim(),
      name: readString(item['name']).trim(),
      detail: readString(item['detail']).trim(),
      // No default. A missing status used to land on `'due'`, which reads as a clinical
      // claim; the recommendation derives from age + sex, whether it was DONE does not.
      status: readCareStatus(item['status']),
      dueDate: readString(item['dueDate']).trim(),
    })),
  };
}

function normalizeBilling(value: unknown): BillingStatement | null {
  const record = isRecord(pluck(value, 'statement')) ? (pluck(value, 'statement') as Record<string, unknown>) : value;
  if (!isRecord(record)) {
    return null;
  }
  const rawLines = Array.isArray(record['lines']) ? record['lines'] : [];
  return {
    patientId: readString(record['patientId']).trim(),
    currency: readString(record['currency']).trim() || 'COP',
    balanceMinor: Math.max(0, Math.trunc(readNumber(record['balanceMinor']))),
    planActive: readBoolean(record['planActive'], false),
    lines: rawLines.filter(isRecord).map((line) => ({
      id: readString(line['id']).trim() || `s-${Math.random().toString(36).slice(2)}`,
      date: readString(line['date']).trim(),
      description: readString(line['description']).trim(),
      amountMinor: Math.max(0, Math.trunc(readNumber(line['amountMinor']))),
    })),
  };
}

function normalizeMessage(value: unknown, threadId: string): MessageThread['messages'][number] | null {
  if (!isRecord(value)) {
    return null;
  }
  const body = readString(value['body']).trim();
  if (!body) {
    return null;
  }
  return {
    id: readString(value['id']).trim() || `m-${Math.random().toString(36).slice(2)}`,
    threadId,
    author: readString(value['author']).trim(),
    body,
    createdAtUtc: readString(value['createdAtUtc']).trim() || new Date().toISOString(),
    outgoing: readBoolean(value['outgoing'], false),
  };
}

function normalizeThread(value: unknown): MessageThread | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  const rawMessages = Array.isArray(value['messages']) ? value['messages'] : [];
  return {
    id,
    participant: readString(value['participant']).trim(),
    subject: readString(value['subject']).trim(),
    lastMessage: readString(value['lastMessage']).trim(),
    lastAtUtc: readString(value['lastAtUtc']).trim() || new Date().toISOString(),
    unread: Math.max(0, Math.trunc(readNumber(value['unread']))),
    messages: rawMessages
      .map((message) => normalizeMessage(message, id))
      .filter((entry): entry is MessageThread['messages'][number] => entry !== null),
  };
}

function normalizeThreads(value: unknown): readonly MessageThread[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'threads'))
      ? (pluck(value, 'threads') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeThread).filter((entry): entry is MessageThread => entry !== null);
}

function normalizeInboxItem(value: unknown): InboxItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim();
  if (!id || !title) {
    return null;
  }
  const kind = readString(value['kind']).toLowerCase();
  return {
    id,
    kind: (kind === 'result' || kind === 'refill' || kind === 'advice' || kind === 'cosign'
      ? kind
      : 'advice') as InboxItem['kind'],
    patientId: readString(value['patientId']).trim(),
    patientName: readString(value['patientName']).trim(),
    title,
    detail: readString(value['detail']).trim(),
    createdAtUtc: readString(value['createdAtUtc']).trim() || new Date().toISOString(),
    priority: readString(value['priority']).toLowerCase() === 'high' ? 'high' : 'routine',
    done: readBoolean(value['done'], false),
  };
}

function normalizeInbox(value: unknown): readonly InboxItem[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'items'))
      ? (pluck(value, 'items') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeInboxItem).filter((entry): entry is InboxItem => entry !== null);
}

function normalizeScheduleSlot(value: unknown): ScheduleSlot | null {
  if (!isRecord(value)) {
    return null;
  }
  const appointmentId = readString(value['appointmentId'] ?? value['id']).trim();
  const patientName = readString(value['patientName']).trim();
  if (!appointmentId || !patientName) {
    return null;
  }
  const state = readString(value['state']).toLowerCase();
  const known: readonly ScheduleSlot['state'][] = [
    'scheduled',
    'arrived',
    'roomed',
    'in-visit',
    'checked-out',
    'no-show',
  ];
  return {
    appointmentId,
    patientId: readString(value['patientId']).trim(),
    patientName,
    doctorId: readString(value['doctorId']).trim(),
    doctorName: readString(value['doctorName']).trim(),
    time: readString(value['time']).trim(),
    durationMin: Math.max(0, Math.trunc(readNumber(value['durationMin']))) || 30,
    reason: readString(value['reason']).trim(),
    type: readString(value['type']).toLowerCase() === 'video' ? 'video' : 'in-person',
    state: known.includes(state as ScheduleSlot['state']) ? (state as ScheduleSlot['state']) : 'scheduled',
  };
}

function normalizeSchedule(value: unknown): readonly ScheduleSlot[] | null {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(pluck(value, 'slots'))
      ? (pluck(value, 'slots') as unknown[])
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeScheduleSlot).filter((entry): entry is ScheduleSlot => entry !== null);
}
