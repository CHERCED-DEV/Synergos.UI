import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type Appointment,
  type AppointmentStatus,
  type BillingStatement,
  type CareStatus,
  type Doctor,
  type EhrCopay,
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
 * El SERVIDOR negó la petición (CMS#197): no es una lectura que falló, es un veredicto sobre
 * quién mira, y viaja con su motivo para que la pantalla diga lo que toca.
 *
 * - `sin-sesion`: 401 — hay que iniciar sesión.
 * - `sin-permiso`: 403 — la cuenta no tiene rol clínico.
 * - `sin-historia`: 404 CON su `{ error }` en el portal — la cuenta no tiene historia vinculada.
 *   Un 404 sin cuerpo es otra cosa —el `[DevSeedOnly]` apagado, la superficie no existe— y
 *   sigue siendo una lectura fallida.
 * - `sin-medico`: 400 de la bandeja clínica — el clínico no tiene médico vinculado y tiene que
 *   decir de quién es la bandeja que quiere ver.
 *
 * **Ninguno degrada a una muestra** (ADR 0112): se degrada por AUSENCIA, nunca por NEGACIÓN.
 * Discriminado por `name` y no por `instanceof`, que no cruza bundles.
 */
export type MotivoDeNegacion = 'sin-sesion' | 'sin-permiso' | 'sin-historia' | 'sin-medico';

export class EhrAccesoDenegadoError extends Error {
  constructor(
    readonly motivo: MotivoDeNegacion,
    readonly endpoint: string,
    /** El `{ error }` que mandó el servidor, tal cual. */
    readonly mensajeDelServidor: string,
  ) {
    super(`EHR "${endpoint}" denied: ${motivo}.`);
    this.name = 'EhrAccesoDenegadoError';
  }
}

export function isEhrAccesoDenegado(error: unknown): error is EhrAccesoDenegadoError {
  return error instanceof Error && error.name === 'EhrAccesoDenegadoError';
}

/** Una respuesta que no fue 2xx, con su estado y —si lo trajo— el `{ error }` del servidor. */
class EhrHttpError extends Error {
  constructor(
    readonly status: number,
    readonly mensajeDelServidor: string | null,
  ) {
    super(`HTTP ${status}`);
    this.name = 'EhrHttpError';
  }
}

/**
 * Una ESCRITURA clínica que no llegó al servidor.
 *
 * Existe porque hasta CHERCED-DEV/Synergos.CMS#111 estas cinco devolvían el valor
 * optimista del llamador: la pantalla confirmaba un encuentro, una receta o una
 * renovación **que el servidor no tiene**. Es la regla 4 —degradar una LECTURA no
 * miente; degradar una ESCRITURA sí— y la 9 —un `catch` que degrada tapa que la
 * llamada NUNCA funcionó—, sobre una receta.
 */
export class EhrWriteFailedError extends Error {
  constructor(
    readonly endpoint: string,
    override readonly cause: unknown,
  ) {
    super(`EHR write "${endpoint}" did not reach the server.`);
    this.name = 'EhrWriteFailedError';
  }
}

/**
 * Thin HTTP client over the Healthcare EHR backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/ehr/patients?q=`            → `{ patients }`
 *  - `GET  /api/ehr/patient/{id}`           → `{ patient, history, encounters, prescriptions, appointments }`
 *  - `GET  /api/ehr/doctors`                → `{ doctors }`
 *  - `POST /api/ehr/appointment` `{ patientId, doctorId, slot }`  → `{ appointment }`
 *  - `POST /api/ehr/encounter`   `{ patientId, soap }`            → `{ encounter }`
 *  - `POST /api/ehr/prescription``{ patientId, items }`           → `{ prescription }`
 *
 * **v2 (dual-portal):**
 *  - `GET  /api/ehr/portal/home`            → `{ patient, cards, nextAppointment, … }`
 *  - `GET  /api/ehr/results`                → `{ results }`
 *  - `GET  /api/ehr/medications`            → `{ medications }`
 *  - `POST /api/ehr/refill` `{ medicationId }`           → `{ status }`
 *  - `GET  /api/ehr/messages`               → `{ threads }`
 *  - `POST /api/ehr/message` `{ threadId, body }`        → `{ message }`
 *  - `GET  /api/ehr/inbasket[?provider=]`   → `{ items }`
 *  - `POST /api/ehr/order` `{ patientId, kind, detail }` → `{ ok }`  (stub)
 *  - `GET  /api/ehr/billing`                → `{ statement }`
 *  - `GET  /api/ehr/schedule?date=`         → `{ slots }` (falls back to appointments)
 *
 * **Quién mira lo dice la SESIÓN, no la página** (CMS#197): el portal es el del paciente
 * vinculado al correo del miembro y la clínica exige rol. Nada de lo de arriba lleva
 * `?patient=`, `?user=` ni `user`/`from`; lo que el servidor NIEGA (401/403, y el 404 con su
 * `{ error }` del portal) sale como {@link EhrAccesoDenegadoError} y nunca como datos.
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
 * **Y una ESCRITURA que no llega LANZA también** (#111). Las cinco —cita, encuentro,
 * receta, renovación y mensaje— devolvían el valor optimista del llamador, así que la
 * pantalla confirmaba lo que el servidor no tenía. Ninguna lo hace ya.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
/**
 * `fetch`, pero sin `apiBase` no llama a nada —ni a una ruta del propio sitio, que podría ser de
 * otra cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
 * compilada. Rechaza, y cada llamada degrada como ante cualquier caída.
 */
function llamar(apiBase: string, url: string, init?: RequestInit): Promise<Response> {
  return apiBase ? fetch(url, init) : Promise.reject(new Error('sin-api'));
}

@Injectable()
export class EhrApiClient {
  readonly #logger = inject(LoggerService);

  // ─── Patients ──────────────────────────────────────────────────────────────

  async patients(apiBase: string, query: string): Promise<readonly Patient[]> {
    const q = query.trim();
    const url = `${apiBase}/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    try {
      const data = await this.getJson(apiBase, url);
      const patients = normalizePatients(data);
      if (patients) {
        return patients;
      }
      throw new Error('patients-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/patients', 'clinica');
      this.unavailable('GET /api/ehr/patients', error);
    }
  }

  async patientChart(apiBase: string, id: string): Promise<PatientChart> {
    const url = `${apiBase}/patient/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(apiBase, url);
      const chart = normalizeChart(data);
      if (chart) {
        return chart;
      }
      throw new Error('chart-shape');
    } catch (error) {
      // #106: `mockChart(id)` answered ANY id with patient zero's record filed under
      // the id that was asked for. There is no safe fallback for a clinical chart.
      this.negar(error, 'GET /api/ehr/patient/{id}', 'clinica');
      this.unavailable('GET /api/ehr/patient/{id}', error);
    }
  }

  // ─── Doctors ───────────────────────────────────────────────────────────────

  async doctors(apiBase: string): Promise<readonly Doctor[]> {
    const url = `${apiBase}/doctors`;
    try {
      const data = await this.getJson(apiBase, url);
      const doctors = normalizeDoctors(data);
      if (doctors) {
        return doctors;
      }
      throw new Error('doctors-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/doctors', error);
    }
  }

  // ─── Copay ─────────────────────────────────────────────────────────────────

  /**
   * `GET /{apiBase}/copay` — lo que cuesta agendar, de la MISMA fuente que lo cobra (CMS#196).
   *
   * Como toda lectura clínica, si falla **lanza** y no devuelve una muestra: un copago inventado
   * es una promesa de plata que el agendamiento rompe. El que llama decide qué decir.
   */
  async copay(apiBase: string): Promise<EhrCopay> {
    const url = `${apiBase}/copay`;
    try {
      const data = await this.getJson(apiBase, url);
      // El número tiene que VENIR: `readNumber` da 0 si falta, y acá un 0 diría «sin costo».
      const amountMinor = isRecord(data) ? data['amountMinor'] : undefined;
      const currency = isRecord(data) ? readString(data['currency']).trim() : '';
      if (typeof amountMinor === 'number' && Number.isInteger(amountMinor) && amountMinor >= 0 && currency) {
        return { amountMinor, currency };
      }
      throw new Error('copay-shape');
    } catch (error) {
      this.unavailable('GET /api/ehr/copay', error);
    }
  }

  // ─── Appointments ──────────────────────────────────────────────────────────
  //
  // `GET /appointments?date=` (la agenda de TODOS los pacientes) ya no tiene método: su único
  // llamador era «Mis citas» del portal, que la bajaba entera y la filtraba en el navegador por
  // el paciente de la página. Desde #197 es de la superficie clínica, y la agenda clínica de
  // esta app es `/schedule`.

  /**
   * `POST /api/ehr/appointment` — reserva el hueco. **La cita que devuelve es la del
   * SERVIDOR**, con su id; si no llega, lanza.
   *
   * Y hasta #111 no la llamaba NADIE: el comprobante «CITA-…» lo acuñaba la
   * estrategia de fulfillment en local y la cita se añadía a «mis citas» sin salir
   * del navegador. El paciente anotaba un número que no existe en ninguna parte y se
   * presentaba a una hora que el consultorio no tenía apartada. Un método sin
   * llamador no se prueba llamándolo (regla 5).
   */
  async bookAppointment(
    apiBase: string,
    body: { patientId?: string; doctorId: string; slot: { date: string; time: string } },
  ): Promise<Appointment> {
    const url = `${apiBase}/appointment`;
    try {
      const data = await this.postJson(apiBase, url, body);
      const appointment = normalizeAppointment(pluck(data, 'appointment') ?? data);
      if (appointment) {
        return appointment;
      }
      throw new Error('appointment-shape');
    } catch (error) {
      // Las dos caras reservan (#197): el clínico a nombre del paciente que dice el cuerpo, el
      // paciente a sí mismo. Cualquiera de las tres negativas puede venir.
      this.negar(error, 'POST /api/ehr/appointment', 'portal');
      this.writeFailed('POST /api/ehr/appointment', error);
    }
  }

  /** `POST /api/ehr/encounter` — guarda la nota SOAP. Lanza si no llega. */
  async saveEncounter(
    apiBase: string,
    body: { patientId: string; soap: SoapNote },
  ): Promise<Encounter> {
    const url = `${apiBase}/encounter`;
    try {
      const data = await this.postJson(apiBase, url, body);
      const encounter = normalizeEncounter(pluck(data, 'encounter') ?? data);
      if (encounter) {
        return encounter;
      }
      throw new Error('encounter-shape');
    } catch (error) {
      this.negar(error, 'POST /api/ehr/encounter', 'clinica');
      this.writeFailed('POST /api/ehr/encounter', error);
    }
  }

  /** `POST /api/ehr/prescription` — emite la receta. Lanza si no llega. */
  async savePrescription(
    apiBase: string,
    body: { patientId: string; items: readonly PrescriptionItem[] },
  ): Promise<Prescription> {
    const url = `${apiBase}/prescription`;
    try {
      const data = await this.postJson(apiBase, url, body);
      const prescription = normalizePrescription(pluck(data, 'prescription') ?? data);
      if (prescription) {
        return prescription;
      }
      throw new Error('prescription-shape');
    } catch (error) {
      this.negar(error, 'POST /api/ehr/prescription', 'clinica');
      this.writeFailed('POST /api/ehr/prescription', error);
    }
  }

  // ─── v2 · Patient portal (MyChart) ───────────────────────────────────────────
  //
  // **El paciente sale de la SESIÓN, no de la página** (CMS#197). Esto mandaba `?patient=`
  // con el `patient` del editor o el `P-1` del componente, y antes de #197 el servidor lo
  // obedecía: cualquiera leía la historia de cualquiera cambiando un atributo. Hoy el servidor
  // resuelve la historia por el correo del miembro e IGNORA lo que mande el navegador; acá ya
  // no se manda. El id del paciente, cuando hace falta, es el que devuelve `portal/home`.

  /** `GET /api/ehr/portal/home` — el home del paciente de la sesión. */
  async portalHome(apiBase: string): Promise<PortalHome> {
    const url = `${apiBase}/portal/home`;
    try {
      const data = await this.getJson(apiBase, url);
      const home = normalizePortalHome(data);
      if (home) {
        return home;
      }
      throw new Error('portal-home-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/portal/home', 'portal');
      // #106: the seeded home carried patient zero's `allergies` under the requested id.
      this.unavailable('GET /api/ehr/portal/home', error);
    }
  }

  /** `GET /api/ehr/results` — lab results (value + range + flag) del paciente de la sesión. */
  async results(apiBase: string): Promise<readonly LabResult[]> {
    const url = `${apiBase}/results`;
    try {
      const data = await this.getJson(apiBase, url);
      const results = normalizeResults(data);
      if (results) {
        return results;
      }
      throw new Error('results-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/results', 'portal');
      this.unavailable('GET /api/ehr/results', error);
    }
  }

  /** `GET /api/ehr/medications` — active medications + refill affordance. */
  async medications(apiBase: string): Promise<readonly Medication[]> {
    const url = `${apiBase}/medications`;
    try {
      const data = await this.getJson(apiBase, url);
      const meds = normalizeMedications(data);
      if (meds) {
        return meds;
      }
      throw new Error('medications-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/medications', 'portal');
      this.unavailable('GET /api/ehr/medications', error);
    }
  }

  /**
   * `POST /api/ehr/refill` — pide la renovación; devuelve el estado del servidor.
   *
   * Sin `patientId` (#197): pedir el resurtido de otro era recetarle. Es el del portal.
   */
  async requestRefill(apiBase: string, body: { medicationId: string }): Promise<RefillStatus> {
    const url = `${apiBase}/refill`;
    try {
      const data = await this.postJson(apiBase, url, body);
      const status = readString(pluck(data, 'status')).toLowerCase();
      if (status === 'requested' || status === 'approved' || status === 'denied') {
        return status;
      }
      throw new Error('refill-shape');
    } catch (error) {
      this.negar(error, 'POST /api/ehr/refill', 'portal');
      this.writeFailed('POST /api/ehr/refill', error);
    }
  }

  /** `GET /api/ehr/health` — health summary (conditions/allergies/vaccines). */
  async healthSummary(apiBase: string): Promise<HealthSummary> {
    const url = `${apiBase}/health`;
    try {
      const data = await this.getJson(apiBase, url);
      const summary = normalizeHealthSummary(data);
      if (summary) {
        return summary;
      }
      throw new Error('health-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/health', 'portal');
      // #106: `mockHealthSummary()` did not even look at the patient.
      this.unavailable('GET /api/ehr/health', error);
    }
  }

  /**
   * `GET /api/ehr/billing` — statement + payment plan state, o `null` si la historia no tiene
   * estado de cuenta.
   *
   * **Su 404 con `{ error }` es «no tienes estado de cuenta», no «no tienes historia»** (#197):
   * el servidor contesta lo segundo también con 404, pero el portal sólo llega aquí después de
   * que `portal/home` confirmó la historia. Decirlo con un `null` —y no con una lectura
   * fallida— es lo que deja pintar «Sin facturación aún» en vez de «no pudimos leer».
   */
  async billing(apiBase: string): Promise<BillingStatement | null> {
    const url = `${apiBase}/billing`;
    try {
      const data = await this.getJson(apiBase, url);
      const statement = normalizeBilling(data);
      if (statement) {
        return statement;
      }
      throw new Error('billing-shape');
    } catch (error) {
      if (error instanceof EhrHttpError && error.status === 404 && error.mensajeDelServidor !== null) {
        return null;
      }
      this.negar(error, 'GET /api/ehr/billing', 'portal');
      this.unavailable('GET /api/ehr/billing', error);
    }
  }

  // ─── v2 · Messaging / In Basket (shared graph, SH-7) ──────────────────────────

  /**
   * `GET /api/ehr/messages` — los hilos de quien está en la sesión: su paciente, o el médico
   * vinculado si es clínico. Sin `?user=` (#197): con el de otro se leían sus conversaciones.
   */
  async messages(apiBase: string): Promise<readonly MessageThread[]> {
    const url = `${apiBase}/messages`;
    try {
      const data = await this.getJson(apiBase, url);
      const threads = normalizeThreads(data);
      if (threads) {
        return threads;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/messages', 'portal');
      this.unavailable('GET /api/ehr/messages', error);
    }
  }

  /**
   * `POST /api/ehr/message` — manda el mensaje. Lanza si no llega.
   *
   * Sin `user`/`from` (#197): quien escribe sale de la sesión; con el nombre de otro, se le
   * hablaba a su médico por él.
   */
  async sendMessage(apiBase: string, body: { threadId: string; body: string }): Promise<void> {
    const url = `${apiBase}/message`;
    try {
      await this.postJson(apiBase, url, body);
    } catch (error) {
      this.negar(error, 'POST /api/ehr/message', 'portal');
      this.writeFailed('POST /api/ehr/message', error);
    }
  }

  /**
   * `GET /api/ehr/inbasket[?provider=]` — clinician In Basket (typed rows).
   *
   * La bandeja es la del médico vinculado al correo del miembro (#197). `provider` SÓLO hace
   * falta para un clínico sin médico vinculado —enfermería, admin, o el directorio de demo,
   * que no tiene correos—, y lo elige quien mira. Antes se mandaba el NOMBRE del rol
   * (`'doctor'`), que no es el id de ningún médico: la bandeja salía vacía y parecía al día.
   * Sin médico vinculado y sin `provider`, el servidor contesta 400 → `sin-medico`.
   */
  async inbox(apiBase: string, provider = ''): Promise<readonly InboxItem[]> {
    const elegido = provider.trim();
    const url = `${apiBase}/inbasket${elegido ? `?provider=${encodeURIComponent(elegido)}` : ''}`;
    try {
      const data = await this.getJson(apiBase, url);
      const items = normalizeInbox(data);
      if (items) {
        return items;
      }
      throw new Error('inbasket-shape');
    } catch (error) {
      if (error instanceof EhrHttpError && error.status === 400 && error.mensajeDelServidor !== null) {
        throw new EhrAccesoDenegadoError('sin-medico', 'GET /api/ehr/inbasket', error.mensajeDelServidor);
      }
      this.negar(error, 'GET /api/ehr/inbasket', 'clinica');
      this.unavailable('GET /api/ehr/inbasket', error);
    }
  }

  /** `POST /api/ehr/order` — cursa la orden / e-Rx. Lanza si no llega. */
  async placeOrder(
    apiBase: string,
    body: { patientId: string; kind: string; detail: string },
  ): Promise<void> {
    const url = `${apiBase}/order`;
    try {
      await this.postJson(apiBase, url, body);
    } catch (error) {
      this.negar(error, 'POST /api/ehr/order', 'clinica');
      this.writeFailed('POST /api/ehr/order', error);
    }
  }

  // ─── v2 · Clinician schedule board ────────────────────────────────────────────

  /** `GET /api/ehr/schedule?date=` — the day's board with arrival states. */
  async schedule(apiBase: string, date: string): Promise<readonly ScheduleSlot[]> {
    const url = `${apiBase}/schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    try {
      const data = await this.getJson(apiBase, url);
      const slots = normalizeSchedule(data);
      if (slots) {
        return slots;
      }
      throw new Error('schedule-shape');
    } catch (error) {
      this.negar(error, 'GET /api/ehr/schedule', 'clinica');
      this.unavailable('GET /api/ehr/schedule', error);
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(apiBase: string, url: string): Promise<unknown> {
    return this.request(apiBase, url, { method: 'GET' });
  }

  private postJson(apiBase: string, url: string, body: unknown): Promise<unknown> {
    return this.request(apiBase, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Sin `apiBase` no se llama a nada —ni a una ruta del propio sitio, que podría ser de otra
   * cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
   * compilada. Se rechaza y cada llamada degrada a su muestra, visible.
   */
  private request(apiBase: string, url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    if (!apiBase) {
      return Promise.reject(new Error('sin-api'));
    }
    return llamar(apiBase, url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then(async (response) => {
      if (response.ok) {
        return response.json();
      }
      // El `{ error }` del cuerpo es lo que separa una NEGATIVA del servidor (#197: todas lo
      // traen) de una superficie que no está —el `[DevSeedOnly]` apagado contesta 404 sin
      // cuerpo—. Un cuerpo que no se puede leer cuenta como «sin cuerpo».
      const cuerpo: unknown = await response.json().catch(() => null);
      const mensaje = isRecord(cuerpo) && typeof cuerpo['error'] === 'string' ? cuerpo['error'] : null;
      return Promise.reject(new EhrHttpError(response.status, mensaje));
    });
  }

  /**
   * Convierte una NEGATIVA del servidor en {@link EhrAccesoDenegadoError} (CMS#197); lo demás
   * lo deja pasar para que quien llama lo trate como lectura o escritura fallida.
   *
   * 401 y 403 son veredictos en cualquier superficie. El 404 sólo lo es en el PORTAL y sólo con
   * su `{ error }`: ahí dice «tu cuenta no tiene historia clínica vinculada»; sin cuerpo es el
   * `[DevSeedOnly]` apagado, y en la clínica es «ese paciente no existe».
   */
  private negar(error: unknown, endpoint: string, superficie: 'portal' | 'clinica'): void {
    if (!(error instanceof EhrHttpError)) {
      return;
    }
    const mensaje = error.mensajeDelServidor ?? '';
    if (error.status === 401) {
      throw new EhrAccesoDenegadoError('sin-sesion', endpoint, mensaje);
    }
    if (error.status === 403) {
      throw new EhrAccesoDenegadoError('sin-permiso', endpoint, mensaje);
    }
    if (superficie === 'portal' && error.status === 404 && error.mensajeDelServidor !== null) {
      throw new EhrAccesoDenegadoError('sin-historia', endpoint, mensaje);
    }
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
   * Una ESCRITURA que no llegó al servidor. **Lanza; no devuelve nada optimista.**
   *
   * #106 dejó esto en pie a sabiendas —su piso eran las lecturas, y con las lecturas
   * honestas ninguna de estas ramas es alcanzable en un apagón TOTAL, porque toda
   * escritura está detrás de una lectura que funcionó—. Lo que las alcanza es un
   * apagón PARCIAL, y eso las hacía menos urgentes, no menos falsas (#111).
   *
   * Quien llama decide qué hacer, y no es la misma respuesta que para una lectura:
   * una lectura ilegible se pinta como hueco y ya; una escritura que no llegó deja a
   * alguien con el texto escrito y sin saber si existe. El piso es **no confirmar lo
   * que no se guardó**, y lo tecleado no se pierde.
   */
  private writeFailed(endpoint: string, error: unknown): never {
    this.#logger.warn(`EHR API "${endpoint}" unavailable — nothing was saved.`, error);
    throw new EhrWriteFailedError(endpoint, error);
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

/** `null` cuando la clave falta o llega `null`: **no consta**, y no el default. */
function readOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const raw = value.trim().toLowerCase();
    if (raw === 'true' || raw === '1') {
      return true;
    }
    if (raw === 'false' || raw === '0') {
      return false;
    }
  }
  return null;
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
    // `null` y no `true`: el borde dejó de afirmarlo (#111) y reponerlo aquí es
    // volver a afirmar lo que el servidor se cuidó de no decir.
    active: readOptionalBoolean(value['active']),
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
    acceptingPatients: readOptionalBoolean(value['acceptingPatients']),
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
    currency: readString(value['currency']).trim(),
    // `null`/ausente ≠ 0 (CMS#116): reponer un cero aquí es afirmar «no tienes nada
    // sin leer» con un servidor que no lo sabe. Igual que `unread` en cada hilo.
    unreadMessages:
      value['unreadMessages'] === undefined || value['unreadMessages'] === null
        ? null
        : Math.max(0, Math.trunc(readNumber(value['unreadMessages']))),
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
    pharmacy: readString(value['pharmacy']).trim() || null,
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
    currency: readString(record['currency']).trim(),
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
    // Sin clave o con `null`, «no lo sabemos» — que no es cero: la insignia se
    // pinta con `> 0` y las dos cosas se veían igual.
    unread:
      value['unread'] === undefined || value['unread'] === null
        ? null
        : Math.max(0, Math.trunc(readNumber(value['unread']))),
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
