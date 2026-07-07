import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type Appointment,
  type AppointmentStatus,
  type BillingStatement,
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
import {
  mockBilling,
  mockHealthSummary,
  mockInbox,
  mockMedications,
  mockMessages,
  mockPortalHome,
  mockResults,
  mockSchedule,
} from './ehr.mock';

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
 * **v2 (dual-portal, backend in parallel — degrade to mock on 404):**
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
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **seeded demo data** and logs a `TODO`, so the
 * whole clinical workflow is complete end-to-end before the backend lands. Every mock
 * path flips the `degraded` flag so the shell can surface a "datos de ejemplo" notice.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class EhrApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

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
      this.markDegraded('GET /api/ehr/patients', error);
      return filterPatients(mockPatients(), q);
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
      this.markDegraded('GET /api/ehr/patient/{id}', error);
      return mockChart(id);
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
      this.markDegraded('GET /api/ehr/doctors', error);
      return mockDoctors();
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
      this.markDegraded('GET /api/ehr/appointments', error);
      return mockAppointments(date);
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
      this.markDegraded('POST /api/ehr/appointment', error);
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
      this.markDegraded('POST /api/ehr/encounter', error);
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
      this.markDegraded('POST /api/ehr/prescription', error);
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
      this.markDegraded('GET /api/ehr/portal/home', error);
      return mockPortalHome(patientId);
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
      this.markDegraded('GET /api/ehr/results', error);
      return mockResults(patientId);
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
      this.markDegraded('GET /api/ehr/medications', error);
      return mockMedications(patientId);
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
      this.markDegraded('POST /api/ehr/refill', error);
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
      this.markDegraded('GET /api/ehr/health', error);
      return mockHealthSummary();
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
      this.markDegraded('GET /api/ehr/billing', error);
      return mockBilling(patientId);
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
      this.markDegraded('GET /api/ehr/messages', error);
      return mockMessages();
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
      this.markDegraded('POST /api/ehr/message', error);
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
      this.markDegraded('GET /api/ehr/inbasket', error);
      return mockInbox();
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
      this.markDegraded('POST /api/ehr/order', error);
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
      this.markDegraded('GET /api/ehr/schedule', error);
      return mockSchedule(date);
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

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the EHR API responds.
    this.#logger.warn(`EHR API "${endpoint}" unavailable — using seeded demo data.`, error);
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

function normalizeHealthSummary(value: unknown): HealthSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawImm = Array.isArray(value['immunizations']) ? value['immunizations'] : [];
  const rawMaint = Array.isArray(value['maintenance']) ? value['maintenance'] : [];
  return {
    conditions: readStringArray(value['conditions']),
    allergies: readStringArray(value['allergies']),
    immunizations: rawImm.filter(isRecord).map((item) => ({
      id: readString(item['id']).trim() || readString(item['name']).trim(),
      name: readString(item['name']).trim(),
      date: readString(item['date']).trim(),
      status: (readString(item['status']).trim() || 'due') as HealthSummary['immunizations'][number]['status'],
    })),
    maintenance: rawMaint.filter(isRecord).map((item) => ({
      id: readString(item['id']).trim() || readString(item['name']).trim(),
      name: readString(item['name']).trim(),
      detail: readString(item['detail']).trim(),
      status: (readString(item['status']).trim() || 'due') as HealthSummary['maintenance'][number]['status'],
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
    checkedInAhead: readBoolean(value['checkedInAhead'], false),
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

// ─── Filtering helpers (shared by mock + live empty fallback) ───────────────────

function filterPatients(patients: readonly Patient[], query: string): readonly Patient[] {
  const term = query.trim().toLowerCase();
  if (!term) {
    return patients;
  }
  return patients.filter(
    (patient) =>
      patient.name.toLowerCase().includes(term) ||
      patient.document.toLowerCase().includes(term) ||
      patient.problems.some((problem) => problem.toLowerCase().includes(term)),
  );
}

// ─── Mock data (visible degradation when the backend is not yet wired) ──────────

const MOCK_DOCTORS: readonly Doctor[] = [
  {
    id: 'D-1',
    name: 'Dra. Laura Méndez',
    specialty: 'Medicina interna',
    license: 'RM-48211',
    phone: '+57 310 555 0101',
    email: 'laura.mendez@clinica.co',
    acceptingPatients: true,
    rating: 4.9,
  },
  {
    id: 'D-2',
    name: 'Dr. Andrés Gómez',
    specialty: 'Cardiología',
    license: 'RM-50934',
    phone: '+57 311 555 0102',
    email: 'andres.gomez@clinica.co',
    acceptingPatients: true,
    rating: 4.7,
  },
  {
    id: 'D-3',
    name: 'Dra. Camila Rojas',
    specialty: 'Pediatría',
    license: 'RM-51777',
    phone: '+57 312 555 0103',
    email: 'camila.rojas@clinica.co',
    acceptingPatients: false,
    rating: 4.8,
  },
  {
    id: 'D-4',
    name: 'Dr. Felipe Suárez',
    specialty: 'Endocrinología',
    license: 'RM-52310',
    phone: '+57 313 555 0104',
    email: 'felipe.suarez@clinica.co',
    acceptingPatients: true,
    rating: 4.6,
  },
];

function mockDoctors(): readonly Doctor[] {
  return MOCK_DOCTORS;
}

const MOCK_PATIENTS: readonly Patient[] = [
  {
    id: 'P-1',
    name: 'María González',
    document: 'CC 1.018.445.221',
    sex: 'F',
    age: 54,
    phone: '+57 300 111 2233',
    email: 'maria.gonzalez@correo.co',
    bloodType: 'O+',
    problems: ['Hipertensión arterial', 'Diabetes tipo 2'],
    allergies: ['Penicilina'],
    primaryDoctorId: 'D-1',
    active: true,
  },
  {
    id: 'P-2',
    name: 'Carlos Ramírez',
    document: 'CC 79.554.110',
    sex: 'M',
    age: 41,
    phone: '+57 301 222 3344',
    email: 'carlos.ramirez@correo.co',
    bloodType: 'A+',
    problems: ['Dislipidemia'],
    allergies: [],
    primaryDoctorId: 'D-2',
    active: true,
  },
  {
    id: 'P-3',
    name: 'Valentina Torres',
    document: 'TI 1.099.882.014',
    sex: 'F',
    age: 9,
    phone: '+57 302 333 4455',
    email: 'familia.torres@correo.co',
    bloodType: 'B+',
    problems: ['Asma'],
    allergies: ['Polen', 'Ácaros'],
    primaryDoctorId: 'D-3',
    active: true,
  },
  {
    id: 'P-4',
    name: 'Jorge Castaño',
    document: 'CC 16.778.452',
    sex: 'M',
    age: 67,
    phone: '+57 304 444 5566',
    email: 'jorge.castano@correo.co',
    bloodType: 'O-',
    problems: ['Hipotiroidismo', 'Artrosis'],
    allergies: ['Sulfas'],
    primaryDoctorId: 'D-4',
    active: false,
  },
  {
    id: 'P-5',
    name: 'Daniela Ospina',
    document: 'CC 1.020.334.987',
    sex: 'F',
    age: 33,
    phone: '+57 305 555 6677',
    email: 'daniela.ospina@correo.co',
    bloodType: 'AB+',
    problems: [],
    allergies: [],
    primaryDoctorId: 'D-1',
    active: true,
  },
];

function mockPatients(): readonly Patient[] {
  return MOCK_PATIENTS;
}

const TODAY = new Date().toISOString().slice(0, 10);

function mockAppointments(date: string): readonly Appointment[] {
  const day = date.trim() || TODAY;
  const base: readonly Omit<Appointment, 'date'>[] = [
    {
      id: 'A-1',
      patientId: 'P-1',
      patientName: 'María González',
      doctorId: 'D-1',
      doctorName: 'Dra. Laura Méndez',
      time: '08:00',
      durationMin: 30,
      reason: 'Control hipertensión',
      status: 'checked-in',
    },
    {
      id: 'A-2',
      patientId: 'P-2',
      patientName: 'Carlos Ramírez',
      doctorId: 'D-2',
      doctorName: 'Dr. Andrés Gómez',
      time: '08:30',
      durationMin: 30,
      reason: 'Valoración cardiológica',
      status: 'booked',
    },
    {
      id: 'A-3',
      patientId: 'P-3',
      patientName: 'Valentina Torres',
      doctorId: 'D-3',
      doctorName: 'Dra. Camila Rojas',
      time: '09:15',
      durationMin: 20,
      reason: 'Seguimiento asma',
      status: 'booked',
    },
    {
      id: 'A-4',
      patientId: 'P-5',
      patientName: 'Daniela Ospina',
      doctorId: 'D-1',
      doctorName: 'Dra. Laura Méndez',
      time: '10:00',
      durationMin: 30,
      reason: 'Consulta general',
      status: 'in-progress',
    },
    {
      id: 'A-5',
      patientId: 'P-4',
      patientName: 'Jorge Castaño',
      doctorId: 'D-4',
      doctorName: 'Dr. Felipe Suárez',
      time: '11:00',
      durationMin: 40,
      reason: 'Control tiroides',
      status: 'no-show',
    },
  ];
  return base.map((appointment) => ({ ...appointment, date: day }));
}

function mockChart(id: string): PatientChart {
  const patient = mockPatients().find((entry) => entry.id === id) ?? mockPatients()[0];
  const encounters: readonly Encounter[] = [
    {
      id: `${patient.id}-E-3`,
      patientId: patient.id,
      doctorId: patient.primaryDoctorId,
      doctorName: 'Dra. Laura Méndez',
      date: '2026-06-18',
      reason: 'Control de cifras tensionales',
      soap: {
        subjective: 'Paciente refiere buena adherencia al tratamiento, sin cefalea ni mareo.',
        objective: {
          systolic: 128,
          diastolic: 82,
          heartRate: 74,
          temperature: 36.6,
          weight: 72,
          height: 162,
          glucose: 104,
        },
        assessment: 'Hipertensión controlada. Diabetes tipo 2 estable.',
        plan: 'Continuar losartán 50 mg. Reforzar dieta hiposódica. Control en 3 meses.',
      },
      signature: 'LM',
    },
    {
      id: `${patient.id}-E-2`,
      patientId: patient.id,
      doctorId: patient.primaryDoctorId,
      doctorName: 'Dra. Laura Méndez',
      date: '2026-03-12',
      reason: 'Control trimestral',
      soap: {
        subjective: 'Refiere episodios ocasionales de cefalea matutina.',
        objective: {
          systolic: 138,
          diastolic: 88,
          heartRate: 78,
          temperature: 36.7,
          weight: 74,
          height: 162,
          glucose: 118,
        },
        assessment: 'Hipertensión en rango limítrofe alto.',
        plan: 'Ajuste de dosis. Solicitar perfil lipídico. Control en 3 meses.',
      },
      signature: 'LM',
    },
    {
      id: `${patient.id}-E-1`,
      patientId: patient.id,
      doctorId: patient.primaryDoctorId,
      doctorName: 'Dra. Laura Méndez',
      date: '2025-12-05',
      reason: 'Valoración inicial',
      soap: {
        subjective: 'Primera consulta. Antecedente familiar de HTA.',
        objective: {
          systolic: 145,
          diastolic: 92,
          heartRate: 82,
          temperature: 36.8,
          weight: 76,
          height: 162,
          glucose: 126,
        },
        assessment: 'Hipertensión arterial grado 1. Diabetes tipo 2 de novo.',
        plan: 'Inicio de antihipertensivo y metformina. Educación en autocuidado.',
      },
      signature: 'LM',
    },
  ];
  const prescriptions: readonly Prescription[] = [
    {
      id: `${patient.id}-RX-2`,
      patientId: patient.id,
      doctorId: patient.primaryDoctorId,
      doctorName: 'Dra. Laura Méndez',
      date: '2026-06-18',
      items: [
        { drug: 'Losartán', dose: '50 mg', frequency: 'Cada 12 horas', durationDays: 90 },
        { drug: 'Metformina', dose: '850 mg', frequency: 'Con cada comida', durationDays: 90 },
      ],
      interactions: [],
    },
    {
      id: `${patient.id}-RX-1`,
      patientId: patient.id,
      doctorId: patient.primaryDoctorId,
      doctorName: 'Dra. Laura Méndez',
      date: '2025-12-05',
      items: [
        { drug: 'Enalapril', dose: '10 mg', frequency: 'Cada 24 horas', durationDays: 30 },
      ],
      interactions: ['Enalapril + Losartán: evitar IECA y ARA-II concomitantes.'],
    },
  ];
  const appointments: readonly Appointment[] = [
    {
      id: `${patient.id}-AP-1`,
      patientId: patient.id,
      patientName: patient.name,
      doctorId: patient.primaryDoctorId,
      doctorName: 'Dra. Laura Méndez',
      date: '2026-09-18',
      time: '08:00',
      durationMin: 30,
      reason: 'Control trimestral',
      status: 'booked',
    },
  ];
  return { patient, history: encounters, encounters, prescriptions, appointments };
}
