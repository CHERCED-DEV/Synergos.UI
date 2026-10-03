import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type AnswerPair,
  type ApplicationDetail,
  type ApplicationStatus,
  type ApplicationSummary,
  type CaseDecision,
  type CreateApplicationRequest,
  type DecisionOutcome,
  type DecisionRequest,
  type GovActNotification,
  type GovCase,
  type GovDocument,
  type GovForm,
  type GovMessage,
  type GovService,
  type GovServiceDetail,
  type QueueCase,
  type TimelineEntry,
  type UploadDocumentRequest,
} from './gov.model';
import {
  MOCK_FORMS,
  MOCK_SERVICES,
  SEED_APPLICATIONS,
  type MockServiceDetail,
  type SeedApplication,
} from './gov.mock';

/**
 * Thin HTTP client over the EXACT Gobierno backend contract (Ola 8). Programs
 * against — and only against — these endpoints/keys (never invents others):
 *
 *  - `GET  /api/gov/services?q=&category=`      → `{ services }`
 *  - `GET  /api/gov/service/{id}`               → `{ service }`
 *  - `GET  /api/gov/form/{serviceId}`           → `{ form }`
 *  - `POST /api/gov/application`                → `{ application }`   (summary)
 *  - `GET  /api/gov/applications`               → `{ applications }`  🔒 sesión
 *  - `GET  /api/gov/notifications`              → `{ notifications }` 🔒 sesión
 *  - `POST /api/gov/notification/{id}/open`     → `{ notification }`  🔒 sesión
 *  - `POST /api/gov/notification`               → `{ notification }`  🔒 funcionario
 *  - `GET  /api/gov/application/{id}`           → `{ application }`   🔒 sesión
 *  - `POST /api/gov/document`                   → `{ document }`      🔒 sesión
 *  - `GET  /api/gov/queue?agency=&status=`      → `{ cases }`
 *  - `GET  /api/gov/case/{id}`                  → `{ case }`
 *  - `POST /api/gov/decision`                   → `{ case }`
 *
 * **Graceful degradation — sólo de LECTURAS:** any 404 / network error / bad shape on a
 * read falls back to a visible **seeded demo store** (catálogo + solicitudes en varios
 * estados + una cola de casos) and latches `degraded` so the shell can show a "datos de
 * ejemplo" notice. No RxJS: native `fetch` + Promise.
 *
 * **Las ESCRITURAS no degradan** (UI#92, reglas 4, 14 y 38): radicar, adjuntar y decidir
 * LANZAN {@link GovWriteFailedError} cuando el borde no contesta. Con un 401/403 ya no
 * fabricaban; con la red caída, sí: un radicado `GOV-2026-…` que no existe en ninguna
 * agencia, un documento «recibido» que no está en ningún expediente y una decisión
 * «registrada» que nadie registró. El componente ya decía «No pudimos radicar…» para
 * cuando el cliente lanzara — y el cliente no lanzaba nunca.
 *
 * **El 401 y el 403 son la excepción a esa degradación, y es deliberado.** Las rutas 🔒
 * son la carpeta del ciudadano: su identidad la resuelve el servidor desde la cookie
 * de sesión (T2), no un `?citizen=<email>` que cualquiera podía teclear. Un 401 no
 * significa "el backend no está" — significa "no hay sesión", y taparlo con datos de
 * ejemplo le mostraría al anónimo una carpeta de solicitudes que no son de nadie.
 * Un 403 significa algo aún más concreto: "eso no es suyo". Degradarlo era peor que un
 * error — devolvía el expediente de otro bajo el id pedido. Ambos viajan tipados
 * (<see cref="GovUnauthorizedError"/> / <see cref="GovForbiddenError"/>) hasta la UI.
 *
 * La cookie viaja sola: `fetch` manda credenciales same-origin por defecto y la app
 * se monta dentro de la propia página del CMS. No se fuerza `credentials: 'include'`
 * —mandaría la cookie a orígenes ajenos si `apiBase` fuera absoluto.
 */

/**
 * El backend exige sesión para esta ruta. NO es una degradación: es un hueco de
 * identidad, y la UI debe ofrecer iniciar sesión en vez de inventar datos.
 */
export class GovUnauthorizedError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 401 ${url}`);
    this.name = 'GovUnauthorizedError';
  }
}

/**
 * `instanceof` no es fiable cruzando bundles (la clase puede venir de otra copia del
 * módulo), así que se discrimina por `name` — el mismo motivo por el que el runtime
 * comparte `sg-core.js` en vez de duplicarlo.
 */
export function isGovUnauthorized(error: unknown): error is GovUnauthorizedError {
  return error instanceof Error && error.name === 'GovUnauthorizedError';
}

/**
 * El backend respondió 403: hay sesión, pero la cuenta NO tiene el rol de funcionario.
 * A diferencia del 401, iniciar sesión otra vez NO ayuda — hace falta que un admin le dé
 * el permiso. Por eso viaja distinto: la consola muestra "no autorizado", no un login.
 * Solo lo lanzan las rutas del funcionario (cola/expediente/decisión).
 */
export class GovForbiddenError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 403 ${url}`);
    this.name = 'GovForbiddenError';
  }
}

/** Discriminado por `name`, no `instanceof` (no cruza bundles). */
export function isGovForbidden(error: unknown): error is GovForbiddenError {
  return error instanceof Error && error.name === 'GovForbiddenError';
}
/**
 * `fetch`, pero sin `apiBase` no llama a nada —ni a una ruta del propio sitio, que podría ser de
 * otra cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
 * compilada. Rechaza, y cada llamada degrada como ante cualquier caída.
 */
function llamar(apiBase: string, url: string, init?: RequestInit): Promise<Response> {
  return apiBase ? fetch(url, init) : Promise.reject(new Error('sin-api'));
}

/**
 * Una ESCRITURA que no quedó en el servidor. **Lanza; no devuelve nada que parezca un
 * acuse** (UI#92). Un número de radicado no es contenido: es la PRUEBA con la que el
 * ciudadano va a reclamar (regla 14). **No enciende `degraded`**: ese cartel dice «estás
 * viendo datos de ejemplo», y aquí no hay ejemplo que enseñar.
 */
export class GovWriteFailedError extends Error {
  constructor(
    readonly endpoint: string,
    override readonly cause: unknown,
  ) {
    super(`Gov write "${endpoint}" did not reach the server.`);
    this.name = 'GovWriteFailedError';
  }
}

@Injectable()
export class GovApiClient {
  readonly #logger = inject(LoggerService);

  #degraded = false;
  /** Seeded application store (mock) — shared across both faces so state advances. */
  #store: Map<string, SeedApplication> | null = null;

  get degraded(): boolean {
    return this.#degraded;
  }

  /** Clear the latch for a fresh identity round (the ehr fix pattern). */
  resetDegraded(): void {
    this.#degraded = false;
  }

  /**
   * Re-lanza un 401/403 en vez de degradar. Lo usan TODAS las rutas que devuelven algo
   * de alguien —la carpeta del ciudadano y la consola del funcionario—: ahí el mock no
   * es una degradación amable, es un dato fabricado con cara de dato real.
   *
   * El catálogo (servicios/ficha/formulario) NO lo llama a propósito: es público, no
   * tiene dueño, y degradarlo no le atribuye a nadie algo que no es suyo.
   */
  private rethrowIfAuthError(error: unknown): void {
    if (isGovUnauthorized(error) || isGovForbidden(error)) {
      throw error;
    }
  }

  // ─── Catálogo ────────────────────────────────────────────────────────────────

  async services(apiBase: string, q: string, category: string): Promise<readonly GovService[]> {
    const params = new URLSearchParams();
    if (q) {
      params.set('q', q);
    }
    if (category) {
      params.set('category', category);
    }
    const query = params.toString();
    const url = `${apiBase}/services${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(apiBase, url);
      const services = normalizeServices(data);
      if (services) {
        return services;
      }
      throw new Error('services-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/services', error);
      return mockServices(q, category);
    }
  }

  async service(apiBase: string, id: string): Promise<GovServiceDetail> {
    const url = `${apiBase}/service/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(apiBase, url);
      const detail = normalizeServiceDetail(data);
      if (detail) {
        return detail;
      }
      throw new Error('service-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/service/{id}', error);
      return mockServiceDetail(id);
    }
  }

  async form(apiBase: string, serviceId: string): Promise<GovForm> {
    const url = `${apiBase}/form/${encodeURIComponent(serviceId)}`;
    try {
      const data = await this.getJson(apiBase, url);
      const form = normalizeForm(data);
      if (form) {
        return form;
      }
      throw new Error('form-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/form/{serviceId}', error);
      return mockForm(serviceId);
    }
  }

  // ─── Solicitud ──────────────────────────────────────────────────────────────

  /**
   * Radica a nombre del member de la SESIÓN. **Nada se degrada**: fabricar un radicado
   * local le daría al usuario un número que NO existe en ninguna agencia. Esto lo decía
   * para el 401/403 y lo hacía con la red caída (UI#92).
   *
   * @throws {GovUnauthorizedError | GovForbiddenError} sin sesión o sin permiso.
   * @throws {GovWriteFailedError} si el borde no la radicó.
   */
  async createApplication(
    apiBase: string,
    body: CreateApplicationRequest,
  ): Promise<ApplicationSummary> {
    const url = `${apiBase}/application`;
    try {
      const data = await this.postJson(apiBase, url, body);
      const summary = normalizeSummary(isRecord(data) ? data['application'] : data);
      if (summary) {
        return summary;
      }
      throw new Error('application-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.writeFailed('POST /api/gov/application', error);
    }
  }

  /**
   * La carpeta del member de la SESIÓN. Sin parámetro de identidad: el `?citizen=<email>`
   * era el IDOR (saber el correo de alguien bastaba para leer sus expedientes) y el
   * backend ya no lo mira.
   *
   * @throws {GovUnauthorizedError | GovForbiddenError} sin sesión o sin permiso.
   */
  async applications(apiBase: string): Promise<readonly ApplicationSummary[]> {
    const url = `${apiBase}/applications`;
    try {
      const data = await this.getJson(apiBase, url);
      const list = normalizeSummaries(data);
      if (list) {
        return list;
      }
      throw new Error('applications-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/gov/applications', error);
      return [...this.mockStore().values()].map(toSummary);
    }
  }

  /**
   * UN expediente del ciudadano de la sesión.
   *
   * **El 403 es el caso grave y por eso se re-lanza.** Este catch degradaba a mock, y como
   * el id ajeno no está en el store local caía en `?? [...values()][0]`: devolvía EL PRIMER
   * expediente que hubiera, rotulado con el id que se pidió. No era "mostrar datos de
   * ejemplo" — era fabricar un registro inexistente y presentarlo como el solicitado, justo
   * a quien el servidor acababa de decirle que no. El `??` también se quitó: un id que no
   * está en el store es "no lo tengo", no una excusa para servir el de otro.
   *
   * @throws {GovUnauthorizedError | GovForbiddenError} sin sesión, o si no es suyo.
   */
  async application(apiBase: string, id: string): Promise<ApplicationDetail> {
    const url = `${apiBase}/application/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(apiBase, url);
      const detail = normalizeDetail(isRecord(data) ? data['application'] : data);
      if (detail) {
        return detail;
      }
      throw new Error('application-detail-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      const seed = this.mockStore().get(id);
      if (!seed) {
        throw error instanceof Error ? error : new Error('application-detail-unavailable');
      }
      this.markDegraded('GET /api/gov/application/{id}', error);
      return toDetail(seed);
    }
  }

  /**
   * Adjunta un documento REAL al expediente (T6): el fichero viaja como multipart.
   *
   * No se fija `Content-Type` a mano — el navegador lo pone junto al `boundary` del
   * `FormData`, y escribirlo rompe el parseo del multipart en el servidor.
   *
   * **No se degrada** (UI#92): un documento «recibido» con el servidor caído dejaba al
   * ciudadano creyendo que subsanó, y el trámite se le vencía por falta de ese papel.
   *
   * @throws {GovUnauthorizedError | GovForbiddenError} sin sesión, o si el expediente no es suyo.
   * @throws {GovWriteFailedError} si el borde no lo guardó.
   */
  async uploadDocument(apiBase: string, body: UploadDocumentRequest): Promise<GovDocument> {
    const url = `${apiBase}/document`;
    const form = new FormData();
    form.append('applicationId', body.applicationId);
    form.append('file', body.file, body.file.name);
    try {
      const data = await this.request(apiBase, url, { method: 'POST', body: form });
      const doc = normalizeDocument(isRecord(data) ? data['document'] : data);
      if (doc) {
        return doc;
      }
      throw new Error('document-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.writeFailed('POST /api/gov/document', error);
    }
  }

  // ─── Funcionario ──────────────────────────────────────────────────────────────
  //
  // La consola del funcionario expone PII de OTROS ciudadanos. Un 401 (anónimo) o un 403
  // (logueado sin rol) NO se degradan a mock —eso le mostraría la cola ajena a quien no
  // debe—: se re-lanzan tipados para que la UI muestre "inicie sesión" / "no autorizado".

  /** @throws {GovUnauthorizedError | GovForbiddenError} sin sesión o sin rol de funcionario. */
  async queue(apiBase: string, agency: string, status: string): Promise<readonly QueueCase[]> {
    const params = new URLSearchParams();
    if (agency) {
      params.set('agency', agency);
    }
    if (status) {
      params.set('status', status);
    }
    const query = params.toString();
    const url = `${apiBase}/queue${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(apiBase, url);
      const cases = normalizeQueue(data);
      if (cases) {
        return cases;
      }
      throw new Error('queue-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/gov/queue', error);
      return this.mockQueue(agency, status);
    }
  }

  /** @throws {GovUnauthorizedError | GovForbiddenError} sin sesión o sin rol de funcionario. */
  async case(apiBase: string, id: string): Promise<GovCase> {
    const url = `${apiBase}/case/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(apiBase, url);
      const kase = normalizeCase(isRecord(data) ? data['case'] : data);
      if (kase) {
        return kase;
      }
      throw new Error('case-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      // Mismo `??` fabricador que en `application(id)`: un id desconocido devolvía el
      // primer caso del store rotulado con el id pedido. Sin fichas de otro: se falla.
      const seed = this.mockStore().get(id);
      if (!seed) {
        throw error instanceof Error ? error : new Error('case-unavailable');
      }
      this.markDegraded('GET /api/gov/case/{id}', error);
      return toCase(seed);
    }
  }

  /**
   * Registra la decisión del funcionario. **No se degrada** (UI#92): el respaldo aprobaba
   * o rechazaba en el almacén de ejemplo y la consola anunciaba «El caso pasó a: Aprobada»
   * sobre una decisión que no quedó en ninguna parte. El #77 ya le había quitado lo peor
   * —devolver el caso de OTRO ciudadano—; quedaba fingir la del pedido.
   *
   * @throws {GovUnauthorizedError | GovForbiddenError} sin sesión o sin rol de funcionario.
   * @throws {GovWriteFailedError} si el borde no la registró.
   */
  async decide(apiBase: string, body: DecisionRequest): Promise<GovCase> {
    const url = `${apiBase}/decision`;
    try {
      const data = await this.postJson(apiBase, url, body);
      const kase = normalizeCase(isRecord(data) ? data['case'] : data);
      if (kase) {
        return kase;
      }
      throw new Error('decision-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.writeFailed('POST /api/gov/decision', error);
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  // ─── Actos administrativos notificados (HU CMS#62 · #20) ────────────────────

  /**
   * La bandeja del ciudadano.
   *
   * **NO trae el cuerpo del acto mientras no esté abierto**, y eso lo decide el
   * backend (`revealBody: false`). Si el listado lo trajera, el acuse sería un
   * botón decorativo: el ciudadano se enteraría de lo resuelto sin que nada
   * registrara que accedió, y el término legal no empezaría a contar nunca.
   *
   * **Se LEE de este lado aunque `Api.Messaging` esté caída** —el expediente vive
   * en el CMS— así que acá sí se degrada: con la capacidad abajo el ciudadano
   * sigue viendo qué le notificaron. Lo que no se puede degradar es ABRIR.
   */
  async notifications(apiBase: string): Promise<readonly GovActNotification[]> {
    const url = `${apiBase}/notifications`;
    try {
      const data = await this.getJson(apiBase, url);
      const list = normalizeNotifications(data);
      if (list) {
        return list;
      }
      throw new Error('notifications-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/gov/notifications', error);
      return [];
    }
  }

  /**
   * Abrir un acto: el instante en que empieza a correr el término.
   *
   * **Esto NO se degrada a mock, y es la diferencia que sostiene la HU.** Fingir
   * que se abrió le diría al ciudadano que su plazo arrancó cuando la entidad no
   * tiene registro de nada — y el día que reclame, no hay con qué. Si falla,
   * falla a la vista.
   *
   * Es `POST` porque ESCRIBE. Con un `GET` lo dispararía el prefetch del
   * navegador o un rastreador siguiendo el enlace de un correo, y la persona
   * perdería días sin haber leído nada.
   */
  async openNotification(apiBase: string, id: string): Promise<GovActNotification> {
    const url = `${apiBase}/notification/${encodeURIComponent(id)}/open`;
    const data = await this.postJson(apiBase, url, {});
    const one = normalizeNotification(isRecord(data) ? data['notification'] : null);
    if (!one) {
      throw new Error('open-notification-shape');
    }
    return one;
  }

  /**
   * Poner un acto en conocimiento (ventanilla).
   *
   * Tampoco se degrada: si no se pudo notificar, decirle al funcionario que sí
   * deja a la entidad creyendo que un término corre. El destinatario lo saca el
   * backend del EXPEDIENTE, no de lo que mande este cliente.
   */
  async notifyAct(
    apiBase: string,
    request: {
      readonly caseId: string;
      readonly title: string;
      readonly body: string;
      readonly acknowledgeBefore?: string;
    },
  ): Promise<GovActNotification> {
    const data = await this.postJson(apiBase, `${apiBase}/notification`, request);
    const one = normalizeNotification(isRecord(data) ? data['notification'] : null);
    if (!one) {
      throw new Error('notify-act-shape');
    }
    return one;
  }

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
    }).then((response) => {
      if (response.status === 401) {
        // Antes caía en el `catch` genérico y se degradaba a mock: el anónimo veía
        // "datos de ejemplo" con solicitudes ajenas en vez de un "inicie sesión".
        return Promise.reject(new GovUnauthorizedError(url));
      }
      if (response.status === 403) {
        // Autenticado pero sin rol (funcionario): tampoco es degradación. Taparlo con
        // mock le mostraría la cola de otros ciudadanos a quien no debe verla.
        return Promise.reject(new GovForbiddenError(url));
      }
      return response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`));
    });
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Gov API responds.
    this.#logger.warn(`Gov API "${endpoint}" unavailable — using seeded demo data.`, error);
  }

  /**
   * Una ESCRITURA que no llegó. **No marca `degraded`, no toca el almacén de ejemplo y no
   * devuelve nada**: el cartel de «datos de ejemplo» es de las LECTURAS.
   */
  private writeFailed(endpoint: string, error: unknown): never {
    this.#logger.warn(`Gov API "${endpoint}" unavailable — nothing was saved.`, error);
    throw new GovWriteFailedError(endpoint, error);
  }

  // ─── Mock store (seeded solicitudes across the lifecycle) ─────────────────────

  private mockStore(): Map<string, SeedApplication> {
    if (!this.#store) {
      this.#store = new Map(SEED_APPLICATIONS.map((app) => [app.id, structuredCloneSafe(app)]));
    }
    return this.#store;
  }

  private mockQueue(agency: string, status: string): readonly QueueCase[] {
    let cases = [...this.mockStore().values()];
    if (agency) {
      cases = cases.filter((app) => mockServiceDetail(app.serviceId).agency === agency);
    }
    if (status) {
      cases = cases.filter((app) => app.status === status);
    }
    return cases.map(toQueueCase);
  }
}

// ─── Mock projections (SeedApplication → contract shapes) ───────────────────────

function toSummary(app: SeedApplication): ApplicationSummary {
  return {
    id: app.id,
    reference: app.reference,
    serviceId: app.serviceId,
    serviceName: app.serviceName,
    status: app.status,
    submittedAt: app.submittedAt,
    currentStage: app.currentStage,
    // La siembra no declara tasa salvo donde la hay: `undefined` cae a «no consta»,
    // que es la verdad sobre un expediente de demostración exento.
    feeMinor: app.feeMinor ?? 0,
    feeStatus: app.feeStatus ?? null,
  };
}

function toDetail(app: SeedApplication): ApplicationDetail {
  return {
    id: app.id,
    reference: app.reference,
    serviceId: app.serviceId,
    serviceName: app.serviceName,
    status: app.status,
    submittedAt: app.submittedAt,
    currentStage: app.currentStage,
    timeline: app.timeline,
    documents: app.documents,
    messages: app.messages,
    // La siembra no declara tasa salvo donde la hay: `undefined` cae a «no consta»,
    // que es la verdad sobre un expediente de demostración exento.
    feeMinor: app.feeMinor ?? 0,
    feeStatus: app.feeStatus ?? null,
  };
}

function toQueueCase(app: SeedApplication): QueueCase {
  return {
    id: app.id,
    reference: app.reference,
    serviceName: app.serviceName,
    citizenName: app.citizenName,
    status: app.status,
    submittedAt: app.submittedAt,
    priority: app.priority,
    slaDaysLeft: app.slaDaysLeft,
    // La siembra no declara tasa salvo donde la hay: `undefined` cae a «no consta»,
    // que es la verdad sobre un expediente de demostración exento.
    feeMinor: app.feeMinor ?? 0,
    feeStatus: app.feeStatus ?? null,
  };
}

function toCase(app: SeedApplication): GovCase {
  return {
    application: {
      id: app.id,
      reference: app.reference,
      serviceName: app.serviceName,
      citizenName: app.citizenName,
      status: app.status,
      submittedAt: app.submittedAt,
      currentStage: app.currentStage,
      feeMinor: app.feeMinor ?? 0,
      feeStatus: app.feeStatus ?? null,
    },
    answers: app.answers,
    documents: app.documents,
    timeline: app.timeline,
    decision: app.decision,
  };
}

function structuredCloneSafe(app: SeedApplication): SeedApplication {
  if (typeof structuredClone === 'function') {
    return structuredClone(app);
  }
  return JSON.parse(JSON.stringify(app)) as SeedApplication;
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

function readStatus(value: unknown): ApplicationStatus {
  const raw = readString(value).toLowerCase();
  const known: readonly ApplicationStatus[] = [
    'submitted',
    'in-review',
    'info-requested',
    'approved',
    'rejected',
  ];
  return (known as readonly string[]).includes(raw) ? (raw as ApplicationStatus) : 'submitted';
}

function readTimelineState(value: unknown): TimelineEntry['state'] {
  const raw = readString(value).toLowerCase();
  return raw === 'done' || raw === 'current' ? raw : 'pending';
}

function readFieldType(value: unknown): GovForm['sections'][number]['fields'][number]['type'] {
  const raw = readString(value).toLowerCase();
  const known = ['text', 'textarea', 'number', 'date', 'select', 'radio', 'checkbox', 'file', 'email', 'tel'];
  return (known.includes(raw) ? raw : 'text') as GovForm['sections'][number]['fields'][number]['type'];
}

function normalizeService(value: unknown): GovService | null {
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
    summary: readString(value['summary']).trim(),
    category: readString(value['category']).trim(),
    agency: readString(value['agency']).trim(),
    estimatedDays: Math.max(0, Math.trunc(readNumber(value['estimatedDays']))),
    feeMinor: Math.max(0, Math.trunc(readNumber(value['feeMinor']))),
    currency: readString(value['currency']).trim(),
  };
}

function normalizeServices(value: unknown): readonly GovService[] | null {
  if (!isRecord(value) || !Array.isArray(value['services'])) {
    return null;
  }
  return value['services']
    .map((entry) => normalizeService(entry))
    .filter((service): service is GovService => service !== null);
}

function normalizeServiceDetail(value: unknown): GovServiceDetail | null {
  const root = isRecord(value) && isRecord(value['service']) ? value['service'] : value;
  if (!isRecord(root)) {
    return null;
  }
  const id = readString(root['id']).trim();
  const name = readString(root['name']).trim();
  if (!id || !name) {
    return null;
  }
  const rawSteps = Array.isArray(root['steps']) ? root['steps'] : [];
  return {
    id,
    name,
    summary: readString(root['summary']).trim(),
    category: readString(root['category']).trim(),
    agency: readString(root['agency']).trim(),
    steps: rawSteps
      .map((step): GovServiceDetail['steps'][number] | null => {
        if (!isRecord(step)) {
          return null;
        }
        const stepId = readString(step['id']).trim();
        const title = readString(step['title']).trim();
        return stepId && title ? { id: stepId, title, detail: readString(step['detail']).trim() } : null;
      })
      .filter((step): step is GovServiceDetail['steps'][number] => step !== null),
    eligibility: readStringArray(root['eligibility']),
    required: readStringArray(root['required']),
    feeMinor: Math.max(0, Math.trunc(readNumber(root['feeMinor']))),
    currency: readString(root['currency']).trim(),
  };
}

function normalizeForm(value: unknown): GovForm | null {
  const root = isRecord(value) && isRecord(value['form']) ? value['form'] : value;
  if (!isRecord(root)) {
    return null;
  }
  const id = readString(root['id']).trim();
  const rawSections = Array.isArray(root['sections']) ? root['sections'] : [];
  const sections = rawSections
    .map((section): GovForm['sections'][number] | null => {
      if (!isRecord(section)) {
        return null;
      }
      const sectionId = readString(section['id']).trim();
      const title = readString(section['title']).trim();
      if (!sectionId || !title) {
        return null;
      }
      const rawFields = Array.isArray(section['fields']) ? section['fields'] : [];
      return {
        id: sectionId,
        title,
        fields: rawFields
          .map((field): GovForm['sections'][number]['fields'][number] | null => {
            if (!isRecord(field)) {
              return null;
            }
            const fieldId = readString(field['id']).trim();
            const label = readString(field['label']).trim();
            if (!fieldId || !label) {
              return null;
            }
            const rawOptions = Array.isArray(field['options']) ? field['options'] : [];
            return {
              id: fieldId,
              label,
              type: readFieldType(field['type']),
              required: readBoolean(field['required']),
              help: readString(field['help']).trim() || undefined,
              pattern: readString(field['pattern']).trim() || undefined,
              options: rawOptions
                .map((opt): { value: string; label: string } | null => {
                  if (!isRecord(opt)) {
                    return null;
                  }
                  const optValue = readString(opt['value']).trim();
                  return optValue
                    ? { value: optValue, label: readString(opt['label']).trim() || optValue }
                    : null;
                })
                .filter((opt): opt is { value: string; label: string } => opt !== null),
            };
          })
          .filter((field): field is GovForm['sections'][number]['fields'][number] => field !== null),
      };
    })
    .filter((section): section is GovForm['sections'][number] => section !== null);
  return { id: id || 'form', title: readString(root['title']).trim(), sections };
}

function normalizeSummary(value: unknown): ApplicationSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const reference = readString(value['reference']).trim();
  if (!id || !reference) {
    return null;
  }
  return {
    id,
    reference,
    serviceId: readString(value['serviceId']).trim() || undefined,
    serviceName: readString(value['serviceName']).trim(),
    status: readStatus(value['status']),
    submittedAt: readString(value['submittedAt']).trim(),
    currentStage: readString(value['currentStage']).trim(),
    // `null`/ausente ≠ «pagada» (CMS#116): el borde declara la clave siempre, y cuando
    // no hay dato manda null. Reponer aquí un `'captured'`, o un `''` que la pantalla
    // pinta como nada, afirmaría un cobro que nadie hizo.
    feeMinor: Math.max(0, Math.trunc(readNumber(value['feeMinor']))),
    feeStatus: readString(value['feeStatus']).trim() || null,
  };
}

function normalizeSummaries(value: unknown): readonly ApplicationSummary[] | null {
  if (!isRecord(value) || !Array.isArray(value['applications'])) {
    return null;
  }
  return value['applications']
    .map((entry) => normalizeSummary(entry))
    .filter((summary): summary is ApplicationSummary => summary !== null);
}

function normalizeTimeline(value: unknown): readonly TimelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index): TimelineEntry | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }
      return {
        id: readString(entry['id']).trim() || `tl-${index}`,
        label,
        date: readString(entry['date']).trim(),
        state: readTimelineState(entry['state']),
        note: readString(entry['note']).trim() || undefined,
      };
    })
    .filter((entry): entry is TimelineEntry => entry !== null);
}

function normalizeDocument(value: unknown): GovDocument | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim();
  if (!id || !name) {
    return null;
  }
  // `downloadUrl` solo llega cuando hay binario detrás (T6); si falta, la UI no ofrece
  // descarga. Se deja `undefined` en vez de '' para que un `@if` simple baste.
  const downloadUrl = readString(value['downloadUrl']).trim();
  return {
    id,
    name,
    status: readString(value['status']).trim() || 'received',
    uploadedAt: readString(value['uploadedAt']).trim(),
    contentType: readString(value['contentType']).trim() || undefined,
    sizeBytes: readNumber(value['sizeBytes']) || undefined,
    downloadUrl: downloadUrl || undefined,
  };
}

function normalizeDocuments(value: unknown): readonly GovDocument[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeDocument(entry)).filter((doc): doc is GovDocument => doc !== null)
    : [];
}

function normalizeMessages(value: unknown): readonly GovMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index): GovMessage | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const body = readString(entry['body']).trim();
      if (!body) {
        return null;
      }
      return {
        id: readString(entry['id']).trim() || `msg-${index}`,
        author: readString(entry['author']).trim(),
        body,
        createdAtUtc: readString(entry['createdAtUtc']).trim(),
        outgoing: readBoolean(entry['outgoing']),
      };
    })
    .filter((msg): msg is GovMessage => msg !== null);
}

function normalizeDetail(value: unknown): ApplicationDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const reference = readString(value['reference']).trim();
  if (!id || !reference) {
    return null;
  }
  return {
    id,
    reference,
    serviceId: readString(value['serviceId']).trim(),
    serviceName: readString(value['serviceName']).trim(),
    status: readStatus(value['status']),
    submittedAt: readString(value['submittedAt']).trim(),
    currentStage: readString(value['currentStage']).trim(),
    timeline: normalizeTimeline(value['timeline']),
    documents: normalizeDocuments(value['documents']),
    messages: normalizeMessages(value['messages']),
    // `null`/ausente ≠ «pagada» (CMS#116): el borde declara la clave siempre, y cuando
    // no hay dato manda null. Reponer aquí un `'captured'`, o un `''` que la pantalla
    // pinta como nada, afirmaría un cobro que nadie hizo.
    feeMinor: Math.max(0, Math.trunc(readNumber(value['feeMinor']))),
    feeStatus: readString(value['feeStatus']).trim() || null,
  };
}

function normalizeQueueCase(value: unknown): QueueCase | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const reference = readString(value['reference']).trim();
  if (!id || !reference) {
    return null;
  }
  return {
    id,
    reference,
    serviceName: readString(value['serviceName']).trim(),
    citizenName: readString(value['citizenName']).trim(),
    status: readStatus(value['status']),
    submittedAt: readString(value['submittedAt']).trim(),
    priority: readString(value['priority']).trim() || 'normal',
    slaDaysLeft: Math.trunc(readNumber(value['slaDaysLeft'])),
    // `null`/ausente ≠ «pagada» (CMS#116): el borde declara la clave siempre, y cuando
    // no hay dato manda null. Reponer aquí un `'captured'`, o un `''` que la pantalla
    // pinta como nada, afirmaría un cobro que nadie hizo.
    feeMinor: Math.max(0, Math.trunc(readNumber(value['feeMinor']))),
    feeStatus: readString(value['feeStatus']).trim() || null,
  };
}

function normalizeQueue(value: unknown): readonly QueueCase[] | null {
  if (!isRecord(value) || !Array.isArray(value['cases'])) {
    return null;
  }
  return value['cases']
    .map((entry) => normalizeQueueCase(entry))
    .filter((kase): kase is QueueCase => kase !== null);
}

function normalizeAnswers(value: unknown): readonly AnswerPair[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): AnswerPair | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      return label ? { label, value: readString(entry['value']).trim() } : null;
    })
    .filter((pair): pair is AnswerPair => pair !== null);
}

function normalizeDecision(value: unknown): CaseDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const raw = readString(value['outcome']).trim().toLowerCase();
  const known: readonly DecisionOutcome[] = ['approve', 'reject', 'request-info'];
  if (!(known as readonly string[]).includes(raw)) {
    return undefined;
  }
  return {
    outcome: raw as DecisionOutcome,
    note: readString(value['note']).trim(),
    decidedAtUtc: readString(value['decidedAtUtc']).trim() || undefined,
  };
}

function normalizeCase(value: unknown): GovCase | null {
  if (!isRecord(value)) {
    return null;
  }
  const app = value['application'];
  if (!isRecord(app)) {
    return null;
  }
  const id = readString(app['id']).trim();
  const reference = readString(app['reference']).trim();
  if (!id || !reference) {
    return null;
  }
  return {
    application: {
      id,
      reference,
      serviceName: readString(app['serviceName']).trim(),
      citizenName: readString(app['citizenName']).trim(),
      status: readStatus(app['status']),
      submittedAt: readString(app['submittedAt']).trim(),
      currentStage: readString(app['currentStage']).trim(),
      // CMS#116 — ver el lector de `normalizeSummary`. `null` es «no consta».
      feeMinor: Math.max(0, Math.trunc(readNumber(app['feeMinor']))),
      feeStatus: readString(app['feeStatus']).trim() || null,
    },
    answers: normalizeAnswers(value['answers']),
    documents: normalizeDocuments(value['documents']),
    timeline: normalizeTimeline(value['timeline']),
    decision: normalizeDecision(value['decision']),
  };
}

// ─── Mock catálogo/form helpers (delegate to the seeded catalogue) ──────────────

function mockServices(q: string, category: string): readonly GovService[] {
  const term = q.trim().toLowerCase();
  let services = MOCK_SERVICES.map((detail) => toServiceSummary(detail));
  if (category) {
    services = services.filter((service) => service.category === category);
  }
  if (term) {
    services = services.filter(
      (service) =>
        service.name.toLowerCase().includes(term) ||
        service.agency.toLowerCase().includes(term) ||
        service.summary.toLowerCase().includes(term),
    );
  }
  return services;
}

function toServiceSummary(detail: MockServiceDetail): GovService {
  return {
    id: detail.id,
    name: detail.name,
    summary: detail.summary,
    category: detail.category,
    agency: detail.agency,
    estimatedDays: detail.estimatedDays,
    feeMinor: detail.feeMinor,
    currency: detail.currency,
  };
}

function mockServiceDetail(id: string): MockServiceDetail {
  return MOCK_SERVICES.find((detail) => detail.id === id) ?? MOCK_SERVICES[0];
}

function mockForm(serviceId: string): GovForm {
  return MOCK_FORMS[serviceId] ?? MOCK_FORMS[MOCK_SERVICES[0].id];
}


function normalizeNotification(value: unknown): GovActNotification | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    caseId: readString(value['caseId']).trim(),
    reference: readString(value['reference']).trim(),
    title: readString(value['title']).trim(),
    // `null` y '' NO significan lo mismo acá: el backend manda null mientras el
    // acto no está abierto, y eso es «todavía no te toca verlo», no «vacío».
    body: typeof value['body'] === 'string' ? value['body'] : null,
    documentRef: typeof value['documentRef'] === 'string' ? value['documentRef'] : null,
    notifiedAt: readString(value['notifiedAt']).trim(),
    acknowledgeBefore: typeof value['acknowledgeBefore'] === 'string' ? value['acknowledgeBefore'] : null,
    openedAt: typeof value['openedAt'] === 'string' ? value['openedAt'] : null,
    openedWith: typeof value['openedWith'] === 'string' ? value['openedWith'] : null,
    opened: value['opened'] === true,
  };
}

function normalizeNotifications(value: unknown): readonly GovActNotification[] | null {
  const raw = isRecord(value) ? value['notifications'] : null;
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw
    .map((entry) => normalizeNotification(entry))
    .filter((entry): entry is GovActNotification => entry !== null);
}
