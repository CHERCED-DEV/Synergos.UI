import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  OUTCOME_TO_STATUS,
  STATUS_LABELS,
  type AnswerPair,
  type ApplicationDetail,
  type ApplicationStatus,
  type ApplicationSummary,
  type CaseDecision,
  type CreateApplicationRequest,
  type DecisionOutcome,
  type DecisionRequest,
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
 *  - `GET  /api/gov/applications?citizen=`      → `{ applications }`
 *  - `GET  /api/gov/application/{id}`           → `{ application }`   (detail)
 *  - `POST /api/gov/document`                   → `{ document }`
 *  - `GET  /api/gov/queue?agency=&status=`      → `{ cases }`
 *  - `GET  /api/gov/case/{id}`                  → `{ case }`
 *  - `POST /api/gov/decision`                   → `{ case }`
 *
 * **Graceful degradation:** any 404 / network error / bad shape falls back to a
 * visible **seeded demo store** (catálogo + solicitudes en varios estados + una
 * cola de casos) and latches `degraded` so the shell can show a "datos de ejemplo"
 * notice. The full lifecycle — radicar → revisar → decidir → subsanar — demos
 * end-to-end offline before the backend lands. No RxJS: native `fetch` + Promise.
 */
@Injectable()
export class GovApiClient {
  readonly #logger = inject(LoggerService);

  #degraded = false;
  /** Seeded application store (mock) — shared across both faces so state advances. */
  #store: Map<string, SeedApplication> | null = null;
  #refSeq = 0;

  get degraded(): boolean {
    return this.#degraded;
  }

  /** Clear the latch for a fresh identity round (the ehr fix pattern). */
  resetDegraded(): void {
    this.#degraded = false;
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
      const data = await this.getJson(url);
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
      const data = await this.getJson(url);
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
      const data = await this.getJson(url);
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

  async createApplication(
    apiBase: string,
    body: CreateApplicationRequest,
  ): Promise<ApplicationSummary> {
    const url = `${apiBase}/application`;
    try {
      const data = await this.postJson(url, body);
      const summary = normalizeSummary(isRecord(data) ? data['application'] : data);
      if (summary) {
        return summary;
      }
      throw new Error('application-shape');
    } catch (error) {
      this.markDegraded('POST /api/gov/application', error);
      return this.mockCreate(body);
    }
  }

  async applications(apiBase: string, citizen: string): Promise<readonly ApplicationSummary[]> {
    const url = `${apiBase}/applications?citizen=${encodeURIComponent(citizen)}`;
    try {
      const data = await this.getJson(url);
      const list = normalizeSummaries(data);
      if (list) {
        return list;
      }
      throw new Error('applications-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/applications', error);
      return [...this.mockStore().values()].map(toSummary);
    }
  }

  async application(apiBase: string, id: string): Promise<ApplicationDetail> {
    const url = `${apiBase}/application/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(isRecord(data) ? data['application'] : data);
      if (detail) {
        return detail;
      }
      throw new Error('application-detail-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/application/{id}', error);
      const seed = this.mockStore().get(id) ?? [...this.mockStore().values()][0];
      return toDetail(seed);
    }
  }

  async uploadDocument(apiBase: string, body: UploadDocumentRequest): Promise<GovDocument> {
    const url = `${apiBase}/document`;
    try {
      const data = await this.postJson(url, body);
      const doc = normalizeDocument(isRecord(data) ? data['document'] : data);
      if (doc) {
        return doc;
      }
      throw new Error('document-shape');
    } catch (error) {
      this.markDegraded('POST /api/gov/document', error);
      return this.mockUpload(body);
    }
  }

  // ─── Funcionario ──────────────────────────────────────────────────────────────

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
      const data = await this.getJson(url);
      const cases = normalizeQueue(data);
      if (cases) {
        return cases;
      }
      throw new Error('queue-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/queue', error);
      return this.mockQueue(agency, status);
    }
  }

  async case(apiBase: string, id: string): Promise<GovCase> {
    const url = `${apiBase}/case/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const kase = normalizeCase(isRecord(data) ? data['case'] : data);
      if (kase) {
        return kase;
      }
      throw new Error('case-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/case/{id}', error);
      const seed = this.mockStore().get(id) ?? [...this.mockStore().values()][0];
      return toCase(seed);
    }
  }

  async decide(apiBase: string, body: DecisionRequest): Promise<GovCase> {
    const url = `${apiBase}/decision`;
    try {
      const data = await this.postJson(url, body);
      const kase = normalizeCase(isRecord(data) ? data['case'] : data);
      if (kase) {
        return kase;
      }
      throw new Error('decision-shape');
    } catch (error) {
      this.markDegraded('POST /api/gov/decision', error);
      return this.mockDecide(body);
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
    // TODO(backend): remove the mock fallback once the Gov API responds.
    this.#logger.warn(`Gov API "${endpoint}" unavailable — using seeded demo data.`, error);
  }

  // ─── Mock store (seeded solicitudes across the lifecycle) ─────────────────────

  private mockStore(): Map<string, SeedApplication> {
    if (!this.#store) {
      this.#store = new Map(SEED_APPLICATIONS.map((app) => [app.id, structuredCloneSafe(app)]));
    }
    return this.#store;
  }

  private mockCreate(body: CreateApplicationRequest): ApplicationSummary {
    const seq = (this.#refSeq += 1);
    const id = `APP-${Date.now().toString(36).toUpperCase()}-${seq}`;
    const reference = `GOV-2026-${String(10000 + this.mockStore().size + seq)}`;
    const service = mockServiceDetail(body.serviceId);
    const nowIso = new Date().toISOString();
    const app: SeedApplication = {
      id,
      reference,
      serviceId: service.id,
      serviceName: service.name,
      citizenName: 'Carolina Pérez García',
      status: 'submitted',
      submittedAt: nowIso,
      currentStage: 'Radicada',
      answers: Object.entries(body.answers).map(([label, value]) => ({ label, value })),
      documents: [],
      messages: [],
      timeline: [
        { id: 'tl-1', label: 'Radicada', date: nowIso.slice(0, 10), state: 'current', note: 'Solicitud radicada en línea.' },
        { id: 'tl-2', label: 'En revisión', date: '', state: 'pending' },
        { id: 'tl-3', label: 'Resultado', date: '', state: 'pending' },
      ],
      priority: 'normal',
      slaDaysLeft: service.estimatedDays,
    };
    this.mockStore().set(id, app);
    return toSummary(app);
  }

  private mockUpload(body: UploadDocumentRequest): GovDocument {
    const nowIso = new Date().toISOString();
    const doc: GovDocument = {
      id: `DOC-${Date.now().toString(36)}`,
      name: body.name,
      status: 'received',
      uploadedAt: nowIso,
    };
    const app = this.mockStore().get(body.applicationId);
    if (app && !app.documents.some((d) => d.name === body.name)) {
      app.documents = [...app.documents, doc];
    }
    return doc;
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

  private mockDecide(body: DecisionRequest): GovCase {
    const app = this.mockStore().get(body.caseId);
    if (!app) {
      // Unknown case: synthesise a minimal decided case (idempotent-ish).
      const fallback = [...this.mockStore().values()][0];
      return toCase(fallback);
    }
    const nowIso = new Date().toISOString();
    const nextStatus: ApplicationStatus = OUTCOME_TO_STATUS[body.outcome];
    const stageLabel = STATUS_LABELS[nextStatus];
    app.status = nextStatus;
    app.currentStage = stageLabel;
    app.decision = { outcome: body.outcome, note: body.note, decidedAtUtc: nowIso };
    app.slaDaysLeft = nextStatus === 'approved' || nextStatus === 'rejected' ? 0 : app.slaDaysLeft;
    // Advance the timeline: current → done, add the decision node as current.
    app.timeline = [
      ...app.timeline.map((entry) => (entry.state === 'current' ? { ...entry, state: 'done' as const } : entry)),
      { id: `tl-${app.timeline.length + 1}`, label: stageLabel, date: nowIso.slice(0, 10), state: 'current' as const, note: body.note || undefined },
    ];
    // Correspondence: officer note lands as an incoming message for the citizen.
    if (body.note) {
      app.messages = [
        ...app.messages,
        {
          id: `msg-${Date.now().toString(36)}`,
          author: 'Funcionario de la agencia',
          body: body.note,
          createdAtUtc: nowIso,
          outgoing: false,
        },
      ];
    }
    return toCase(app);
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
    currency: readString(value['currency']).trim() || 'COP',
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
    currency: readString(root['currency']).trim() || 'COP',
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
  return {
    id,
    name,
    status: readString(value['status']).trim() || 'received',
    uploadedAt: readString(value['uploadedAt']).trim(),
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
