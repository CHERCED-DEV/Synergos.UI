import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  CASE_STATUS_LABELS,
  canTransition,
  type ApplicantInfo,
  type ApplicationRequest,
  type ApplicationResult,
  type CaseDetailResult,
  type CaseStatus,
  type DocRef,
  type Fee,
  type FormFieldDef,
  type FormFieldType,
  type GovCase,
  type GovRole,
  type TimelineEntry,
  type TramiteCategory,
  type TramiteChannel,
  type TramiteDetail,
  type TramiteSearchResult,
  type TramiteSummary,
  type TransitionResult,
} from './gov.model';

/**
 * Thin HTTP client over the Gobierno backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/gov/tramites?q=&category=`            → `{ tramites, total }`
 *  - `GET  /api/gov/tramite/{id}`                     → `{ tramite, formDefinition, requirements, fee }`
 *  - `POST /api/gov/application`                      → `{ caseId, radicado, fee? }`
 *  - `POST /api/gov/application/{id}/documents`       → `{ id, name, size }`
 *  - `GET  /api/gov/case/{id}`                        → `{ case, status, timeline }`
 *  - `GET  /api/gov/inbox?actor=&role=`               → `{ cases }`
 *  - `POST /api/gov/case/{id}/transition` `{to,note}` → `{ status }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error /
 * non-OK), the client falls back to a visible **seeded demo store** (catálogo de
 * trámites + expedientes en varios estados) and logs a `TODO`, so the full case
 * lifecycle — radicar → revisar → subsanar → resolver — demos end-to-end before
 * the backend lands. Every mock path flips the `degraded` flag so the shell can
 * surface a "datos de ejemplo" notice.
 *
 * The mock transition path enforces the **legal state machine** (`canTransition`):
 * an illegal or repeated transition is a no-op that returns the current status —
 * the idempotence the spec calls central for this domain.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class GovApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  /** Seeded case store (mock) — shared by both faces so the demo state advances. */
  #cases: Map<string, GovCase> | null = null;

  #radicadoSeq = 0;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Catálogo de trámites (search + categoría) ───────────────────────────────

  async tramites(apiBase: string, q: string, category: string): Promise<TramiteSearchResult> {
    const params = new URLSearchParams();
    if (q) {
      params.set('q', q);
    }
    if (category) {
      params.set('category', category);
    }
    const query = params.toString();
    const url = `${apiBase}/tramites${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeSearch(data);
      if (result) {
        return result;
      }
      throw new Error('tramites-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/tramites', error);
      return mockSearch(q, category);
    }
  }

  // ─── Ficha del trámite (definition drives the wizard) ────────────────────────

  async tramite(apiBase: string, id: string): Promise<TramiteDetail> {
    const url = `${apiBase}/tramite/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(data);
      if (detail) {
        return detail;
      }
      throw new Error('tramite-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/tramite/{id}', error);
      return mockDetail(id);
    }
  }

  // ─── Radicar la solicitud (creates the expediente) ───────────────────────────

  async submitApplication(apiBase: string, body: ApplicationRequest): Promise<ApplicationResult> {
    const url = `${apiBase}/application`;
    try {
      const data = await this.postJson(url, body);
      const result = normalizeApplication(data);
      if (result) {
        return result;
      }
      throw new Error('application-shape');
    } catch (error) {
      this.markDegraded('POST /api/gov/application', error);
      return this.mockSubmit(body);
    }
  }

  // ─── Adjuntar documentos al expediente ───────────────────────────────────────

  async uploadDocument(apiBase: string, applicationId: string, doc: DocRef): Promise<DocRef> {
    const url = `${apiBase}/application/${encodeURIComponent(applicationId)}/documents`;
    try {
      const data = await this.postJson(url, { name: doc.name, size: doc.size });
      const ref = normalizeDoc(data);
      if (ref) {
        return ref;
      }
      throw new Error('document-shape');
    } catch (error) {
      this.markDegraded('POST /api/gov/application/{id}/documents', error);
      this.mockAttachDocument(applicationId, doc);
      return doc;
    }
  }

  // ─── Seguimiento del expediente ──────────────────────────────────────────────

  async getCase(apiBase: string, id: string): Promise<CaseDetailResult> {
    const url = `${apiBase}/case/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeCaseDetail(data);
      if (result) {
        return result;
      }
      throw new Error('case-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/case/{id}', error);
      const kase = this.mockStore().get(id);
      const fallback = kase ?? [...this.mockStore().values()][0];
      return { case: fallback, status: fallback.status, timeline: fallback.timeline };
    }
  }

  // ─── Bandeja (mi carpeta del ciudadano / cola del funcionario) ────────────────

  async inbox(apiBase: string, actor: string, role: GovRole): Promise<readonly GovCase[]> {
    const params = new URLSearchParams({ actor, role });
    const url = `${apiBase}/inbox?${params.toString()}`;
    try {
      const data = await this.getJson(url);
      const cases = normalizeCases(data);
      if (cases) {
        return cases;
      }
      throw new Error('inbox-shape');
    } catch (error) {
      this.markDegraded('GET /api/gov/inbox', error);
      const all = [...this.mockStore().values()];
      // Citizen sees own cases; officer sees the whole queue.
      return role === 'officer'
        ? all
        : all.filter((kase) => kase.applicant.docNumber === actorDocNumber(actor));
    }
  }

  // ─── Transición de estado (máquina legal — auditada) ─────────────────────────

  async transition(
    apiBase: string,
    caseId: string,
    to: CaseStatus,
    note: string,
    actor: string,
  ): Promise<TransitionResult> {
    const url = `${apiBase}/case/${encodeURIComponent(caseId)}/transition`;
    try {
      const data = await this.postJson(url, { to, note });
      const result = normalizeTransition(data);
      if (result) {
        return result;
      }
      throw new Error('transition-shape');
    } catch (error) {
      this.markDegraded('POST /api/gov/case/{id}/transition', error);
      return this.mockTransition(caseId, to, note, actor);
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

  // ─── Mock store (seeded expedientes across the whole lifecycle) ──────────────

  private mockStore(): Map<string, GovCase> {
    if (!this.#cases) {
      this.#cases = new Map(SEED_CASES.map((kase) => [kase.caseId, kase]));
    }
    return this.#cases;
  }

  private mockSubmit(body: ApplicationRequest): ApplicationResult {
    const seq = (this.#radicadoSeq += 1);
    const caseId = `CASE-${Date.now().toString(36).toUpperCase()}-${seq}`;
    const radicado = `GOV-2026-${String(10000 + this.mockStore().size + seq)}`;
    const detail = mockDetail(body.tramiteId);
    const today = isoToday();
    const kase: GovCase = {
      caseId,
      radicado,
      tramiteId: detail.tramite.id,
      tramiteName: detail.tramite.name,
      entity: detail.tramite.entity,
      applicant: body.applicant,
      answers: body.answers,
      documents: [],
      fee: detail.fee,
      paid: body.paid,
      status: 'radicado',
      timeline: [
        {
          status: 'radicado',
          date: today,
          actor: body.applicant.name,
          note: 'Solicitud radicada en línea.',
        },
      ],
      submittedAt: today,
      slaDays: detail.tramite.estimatedDays,
      daysLeft: detail.tramite.estimatedDays,
    };
    this.mockStore().set(caseId, kase);
    return { caseId, radicado, fee: detail.fee };
  }

  private mockAttachDocument(applicationId: string, doc: DocRef): void {
    const kase = this.mockStore().get(applicationId);
    if (!kase || kase.documents.some((existing) => existing.id === doc.id)) {
      return;
    }
    this.mockStore().set(applicationId, { ...kase, documents: [...kase.documents, doc] });
  }

  private mockTransition(
    caseId: string,
    to: CaseStatus,
    note: string,
    actor: string,
  ): TransitionResult {
    const kase = this.mockStore().get(caseId);
    if (!kase) {
      return { status: to };
    }
    // Legal state machine: illegal or repeated transitions are a NO-OP (idempotent).
    if (!canTransition(kase.status, to)) {
      return { status: kase.status };
    }
    const closed = to === 'resuelto' || to === 'rechazado';
    const next: GovCase = {
      ...kase,
      status: to,
      daysLeft: closed ? 0 : kase.daysLeft,
      timeline: [
        ...kase.timeline,
        {
          status: to,
          date: isoToday(),
          actor,
          note: note.trim() || CASE_STATUS_LABELS[to],
        },
      ],
    };
    this.mockStore().set(caseId, next);
    return { status: to };
  }
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

function readCategory(value: unknown): TramiteCategory {
  const raw = readString(value).toLowerCase();
  const known: readonly TramiteCategory[] = [
    'identidad',
    'salud',
    'tributario',
    'vehiculos',
    'empresa',
  ];
  return known.includes(raw as TramiteCategory) ? (raw as TramiteCategory) : 'identidad';
}

function readChannel(value: unknown): TramiteChannel {
  const raw = readString(value).toLowerCase();
  return raw === 'presencial' || raw === 'mixto' ? raw : 'en-linea';
}

function readStatus(value: unknown): CaseStatus {
  const raw = readString(value).toLowerCase();
  const known: readonly CaseStatus[] = [
    'radicado',
    'en-revision',
    'subsanacion',
    'resuelto',
    'rechazado',
  ];
  return known.includes(raw as CaseStatus) ? (raw as CaseStatus) : 'radicado';
}

function readFieldType(value: unknown): FormFieldType {
  const raw = readString(value).toLowerCase();
  const known: readonly FormFieldType[] = [
    'text',
    'email',
    'tel',
    'number',
    'date',
    'select',
    'textarea',
    'checkbox',
  ];
  return known.includes(raw as FormFieldType) ? (raw as FormFieldType) : 'text';
}

function normalizeTramite(value: unknown): TramiteSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim() || readString(value['title']).trim();
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    entity: readString(value['entity']).trim(),
    category: readCategory(value['category']),
    channel: readChannel(value['channel']),
    summary: readString(value['summary']).trim() || readString(value['description']).trim(),
    estimatedDays: Math.max(0, Math.trunc(readNumber(value['estimatedDays']))),
    feeAmount: Math.max(0, readNumber(value['feeAmount'] ?? value['fee'])),
    currency: readString(value['currency']).trim() || 'COP',
  };
}

function normalizeSearch(value: unknown): TramiteSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const raw = Array.isArray(value['tramites'])
    ? value['tramites']
    : Array.isArray(value['items'])
      ? value['items']
      : [];
  const tramites = raw
    .map((entry) => normalizeTramite(entry))
    .filter((tramite): tramite is TramiteSummary => tramite !== null);
  return { tramites, total: Math.trunc(readNumber(value['total'])) || tramites.length };
}

function normalizeField(value: unknown): FormFieldDef | null {
  if (!isRecord(value)) {
    return null;
  }
  const key = readString(value['key']).trim() || readString(value['name']).trim();
  const label = readString(value['label']).trim();
  if (!key || !label) {
    return null;
  }
  const rawOptions = Array.isArray(value['options']) ? value['options'] : [];
  return {
    key,
    label,
    type: readFieldType(value['type']),
    required: readBoolean(value['required']),
    hint: readString(value['hint']).trim(),
    placeholder: readString(value['placeholder']).trim(),
    options: rawOptions
      .map((option): FormFieldDef['options'][number] | null => {
        if (typeof option === 'string') {
          const trimmed = option.trim();
          return trimmed ? { value: trimmed, label: trimmed } : null;
        }
        if (!isRecord(option)) {
          return null;
        }
        const optionValue = readString(option['value']).trim();
        if (!optionValue) {
          return null;
        }
        return { value: optionValue, label: readString(option['label']).trim() || optionValue };
      })
      .filter((option): option is FormFieldDef['options'][number] => option !== null),
  };
}

function normalizeFee(value: unknown, currency: string): Fee {
  const f = isRecord(value) ? value : {};
  return {
    amount: Math.max(0, readNumber(f['amount'])),
    currency: readString(f['currency']).trim() || currency,
    exempt: readBoolean(f['exempt']),
  };
}

function normalizeDetail(value: unknown): TramiteDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const tramite = normalizeTramite(value['tramite'] ?? value);
  if (!tramite) {
    return null;
  }
  const rawFields = Array.isArray(value['formDefinition']) ? value['formDefinition'] : [];
  return {
    tramite,
    formDefinition: rawFields
      .map((field) => normalizeField(field))
      .filter((field): field is FormFieldDef => field !== null),
    requirements: readStringArray(value['requirements']),
    fee: normalizeFee(value['fee'], tramite.currency),
  };
}

function normalizeApplication(value: unknown): ApplicationResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const caseId = readString(value['caseId']).trim() || readString(value['id']).trim();
  const radicado = readString(value['radicado']).trim();
  if (!caseId || !radicado) {
    return null;
  }
  return {
    caseId,
    radicado,
    fee: isRecord(value['fee']) ? normalizeFee(value['fee'], 'COP') : undefined,
  };
}

function normalizeDoc(value: unknown): DocRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim();
  if (!id || !name) {
    return null;
  }
  return { id, name, size: Math.max(0, Math.trunc(readNumber(value['size']))) };
}

function normalizeTimeline(value: unknown): readonly TimelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): TimelineEntry | null => {
      if (!isRecord(entry)) {
        return null;
      }
      return {
        status: readStatus(entry['status']),
        date: readString(entry['date']).trim(),
        actor: readString(entry['actor']).trim(),
        note: readString(entry['note']).trim(),
      };
    })
    .filter((entry): entry is TimelineEntry => entry !== null);
}

function normalizeApplicant(value: unknown): ApplicantInfo {
  const a = isRecord(value) ? value : {};
  return {
    name: readString(a['name']).trim(),
    docType: readString(a['docType']).trim() || 'CC',
    docNumber: readString(a['docNumber']).trim(),
    email: readString(a['email']).trim(),
    phone: readString(a['phone']).trim(),
  };
}

function normalizeTransition(value: unknown): TransitionResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const raw = readString(value['status']).trim();
  if (!raw) {
    return null;
  }
  return { status: readStatus(raw) };
}

function normalizeCase(value: unknown): GovCase | null {
  if (!isRecord(value)) {
    return null;
  }
  const caseId = readString(value['caseId']).trim() || readString(value['id']).trim();
  const radicado = readString(value['radicado']).trim();
  if (!caseId || !radicado) {
    return null;
  }
  const answers = isRecord(value['answers'])
    ? Object.fromEntries(
        Object.entries(value['answers']).map(([key, raw]) => [key, readString(raw)]),
      )
    : {};
  const rawDocs = Array.isArray(value['documents']) ? value['documents'] : [];
  return {
    caseId,
    radicado,
    tramiteId: readString(value['tramiteId']).trim(),
    tramiteName: readString(value['tramiteName']).trim(),
    entity: readString(value['entity']).trim(),
    applicant: normalizeApplicant(value['applicant']),
    answers,
    documents: rawDocs
      .map((doc) => normalizeDoc(doc))
      .filter((doc): doc is DocRef => doc !== null),
    fee: normalizeFee(value['fee'], 'COP'),
    paid: readBoolean(value['paid']),
    status: readStatus(value['status']),
    timeline: normalizeTimeline(value['timeline']),
    submittedAt: readString(value['submittedAt']).trim(),
    slaDays: Math.max(0, Math.trunc(readNumber(value['slaDays']))),
    daysLeft: Math.max(0, Math.trunc(readNumber(value['daysLeft']))),
  };
}

function normalizeCases(value: unknown): readonly GovCase[] | null {
  const raw = isRecord(value) && Array.isArray(value['cases'])
    ? value['cases']
    : Array.isArray(value)
      ? value
      : null;
  if (!raw) {
    return null;
  }
  return raw.map((entry) => normalizeCase(entry)).filter((kase): kase is GovCase => kase !== null);
}

function normalizeCaseDetail(value: unknown): CaseDetailResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const kase = normalizeCase(value['case'] ?? value);
  if (!kase) {
    return null;
  }
  const timeline = normalizeTimeline(value['timeline']);
  return {
    case: timeline.length > 0 ? { ...kase, timeline } : kase,
    status: readStatus(value['status'] ?? kase.status),
    timeline: timeline.length > 0 ? timeline : kase.timeline,
  };
}

function actorDocNumber(actor: string): string {
  // Demo actor ids look like "CC-52841903"; fall back to the raw value.
  const parts = actor.split('-');
  return parts.length > 1 ? parts[parts.length - 1] : actor;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Mock data (visible degradation when the backend is not yet wired) ──────────

/**
 * Seeded catálogo — each trámite carries its own `formDefinition` so the wizard
 * demonstrably renders from data (a new trámite = new definition, zero code).
 */
const MOCK_TRAMITES: readonly TramiteDetail[] = [
  {
    tramite: {
      id: 'T-PASAPORTE',
      name: 'Expedición de pasaporte',
      entity: 'Cancillería',
      category: 'identidad',
      channel: 'mixto',
      summary:
        'Obtenga su pasaporte para viajar fuera del país. Se solicita en línea y se recoge en la sede.',
      estimatedDays: 8,
      feeAmount: 190000,
      currency: 'COP',
    },
    formDefinition: [
      {
        key: 'tipoPasaporte',
        label: 'Tipo de pasaporte',
        type: 'select',
        required: true,
        hint: 'El ordinario sirve para la mayoría de los viajes.',
        placeholder: '',
        options: [
          { value: 'ordinario', label: 'Ordinario (32 páginas)' },
          { value: 'ejecutivo', label: 'Ejecutivo (48 páginas)' },
        ],
      },
      {
        key: 'fechaNacimiento',
        label: 'Fecha de nacimiento',
        type: 'date',
        required: true,
        hint: 'Como aparece en su documento de identidad.',
        placeholder: '',
        options: [],
      },
      {
        key: 'ciudadExpedicion',
        label: 'Ciudad donde recogerá el pasaporte',
        type: 'select',
        required: true,
        hint: '',
        placeholder: '',
        options: [
          { value: 'bogota', label: 'Bogotá' },
          { value: 'medellin', label: 'Medellín' },
          { value: 'cali', label: 'Cali' },
        ],
      },
    ],
    requirements: [
      'Cédula de ciudadanía escaneada por ambas caras (PDF)',
      'Pasaporte anterior, si lo tiene (PDF)',
    ],
    fee: { amount: 190000, currency: 'COP', exempt: false },
  },
  {
    tramite: {
      id: 'T-ANTECEDENTES',
      name: 'Certificado de antecedentes judiciales',
      entity: 'Policía Nacional',
      category: 'identidad',
      channel: 'en-linea',
      summary:
        'Descargue el certificado que dice si tiene o no antecedentes judiciales. Es gratis e inmediato.',
      estimatedDays: 1,
      feeAmount: 0,
      currency: 'COP',
    },
    formDefinition: [
      {
        key: 'motivoConsulta',
        label: 'Motivo de la consulta',
        type: 'select',
        required: true,
        hint: 'Solo se usa con fines estadísticos.',
        placeholder: '',
        options: [
          { value: 'laboral', label: 'Requisito laboral' },
          { value: 'personal', label: 'Uso personal' },
          { value: 'visa', label: 'Solicitud de visa' },
        ],
      },
      {
        key: 'aceptaTratamiento',
        label: 'Autorizo el tratamiento de mis datos personales',
        type: 'checkbox',
        required: true,
        hint: 'Ley 1581 de 2012.',
        placeholder: '',
        options: [],
      },
    ],
    requirements: [],
    fee: { amount: 0, currency: 'COP', exempt: false },
  },
  {
    tramite: {
      id: 'T-LICENCIA-DUP',
      name: 'Duplicado de licencia de conducción',
      entity: 'Ministerio de Transporte',
      category: 'vehiculos',
      channel: 'en-linea',
      summary:
        'Pida una copia de su licencia si la perdió o se la robaron. Llega a su casa en pocos días.',
      estimatedDays: 5,
      feeAmount: 267000,
      currency: 'COP',
    },
    formDefinition: [
      {
        key: 'categoriaLicencia',
        label: 'Categoría de la licencia',
        type: 'select',
        required: true,
        hint: '',
        placeholder: '',
        options: [
          { value: 'a2', label: 'A2 — Motocicletas' },
          { value: 'b1', label: 'B1 — Automóviles particulares' },
          { value: 'c1', label: 'C1 — Automóviles de servicio público' },
        ],
      },
      {
        key: 'motivoDuplicado',
        label: '¿Por qué necesita el duplicado?',
        type: 'select',
        required: true,
        hint: '',
        placeholder: '',
        options: [
          { value: 'perdida', label: 'Pérdida' },
          { value: 'hurto', label: 'Hurto' },
          { value: 'deterioro', label: 'Deterioro' },
        ],
      },
      {
        key: 'direccionEntrega',
        label: 'Dirección de entrega',
        type: 'text',
        required: true,
        hint: 'Donde quiere recibir la licencia.',
        placeholder: 'Calle 12 #34-56, Bogotá',
        options: [],
      },
    ],
    requirements: ['Denuncia de pérdida o hurto, si aplica (PDF)'],
    fee: { amount: 267000, currency: 'COP', exempt: false },
  },
  {
    tramite: {
      id: 'T-SISBEN',
      name: 'Actualización de datos en el Sisbén',
      entity: 'Departamento Nacional de Planeación',
      category: 'salud',
      channel: 'en-linea',
      summary:
        'Actualice la información de su hogar para que su clasificación del Sisbén refleje su situación real.',
      estimatedDays: 15,
      feeAmount: 0,
      currency: 'COP',
    },
    formDefinition: [
      {
        key: 'personasHogar',
        label: 'Personas que viven en el hogar',
        type: 'number',
        required: true,
        hint: 'Incluya niños y adultos mayores.',
        placeholder: '3',
        options: [],
      },
      {
        key: 'cambioReportado',
        label: '¿Qué cambió en su hogar?',
        type: 'textarea',
        required: true,
        hint: 'Cuéntenos en sus palabras. Por ejemplo: cambio de vivienda o de ingresos.',
        placeholder: '',
        options: [],
      },
    ],
    requirements: ['Recibo de un servicio público reciente (PDF o foto)'],
    fee: { amount: 0, currency: 'COP', exempt: false },
  },
  {
    tramite: {
      id: 'T-MATRICULA',
      name: 'Renovación de matrícula mercantil',
      entity: 'Cámara de Comercio',
      category: 'empresa',
      channel: 'en-linea',
      summary:
        'Renueve cada año la matrícula de su negocio para mantenerlo activo y al día ante la ley.',
      estimatedDays: 3,
      feeAmount: 45000,
      currency: 'COP',
    },
    formDefinition: [
      {
        key: 'nit',
        label: 'NIT del negocio',
        type: 'text',
        required: true,
        hint: 'Sin dígito de verificación.',
        placeholder: '901234567',
        options: [],
      },
      {
        key: 'activosTotales',
        label: 'Activos totales del último año (COP)',
        type: 'number',
        required: true,
        hint: 'El valor define la tarifa de la renovación.',
        placeholder: '25000000',
        options: [],
      },
      {
        key: 'correoNotificaciones',
        label: 'Correo para notificaciones judiciales',
        type: 'email',
        required: true,
        hint: '',
        placeholder: 'negocio@example.com',
        options: [],
      },
    ],
    requirements: ['Estados financieros del último año (PDF)'],
    fee: { amount: 45000, currency: 'COP', exempt: false },
  },
  {
    tramite: {
      id: 'T-PREDIAL',
      name: 'Certificado de paz y salvo predial',
      entity: 'Secretaría de Hacienda',
      category: 'tributario',
      channel: 'en-linea',
      summary:
        'Certifique que su predio no debe impuesto predial. Lo necesita para vender o hipotecar.',
      estimatedDays: 2,
      feeAmount: 0,
      currency: 'COP',
    },
    formDefinition: [
      {
        key: 'chip',
        label: 'CHIP o matrícula inmobiliaria del predio',
        type: 'text',
        required: true,
        hint: 'Lo encuentra en el recibo del predial.',
        placeholder: 'AAA0123XYZ',
        options: [],
      },
      {
        key: 'usoCertificado',
        label: 'Para qué necesita el certificado',
        type: 'select',
        required: false,
        hint: '',
        placeholder: '',
        options: [
          { value: 'venta', label: 'Venta del predio' },
          { value: 'credito', label: 'Crédito o hipoteca' },
          { value: 'otro', label: 'Otro' },
        ],
      },
    ],
    requirements: [],
    fee: { amount: 0, currency: 'COP', exempt: false },
  },
];

/**
 * Seeded expedientes across the lifecycle so both bandejas demo the full cycle
 * (radicado / en revisión / subsanación / resuelto) without touching the backend.
 */
const SEED_CASES: readonly GovCase[] = [
  {
    caseId: 'CASE-SEED-1',
    radicado: 'GOV-2026-10001',
    tramiteId: 'T-PASAPORTE',
    tramiteName: 'Expedición de pasaporte',
    entity: 'Cancillería',
    applicant: {
      name: 'Carolina Pérez García',
      docType: 'CC',
      docNumber: '52841903',
      email: 'carolina.perez@example.com',
      phone: '3005550187',
    },
    answers: { tipoPasaporte: 'ordinario', ciudadExpedicion: 'bogota' },
    documents: [{ id: 'D-1', name: 'cedula.pdf', size: 245760 }],
    fee: { amount: 190000, currency: 'COP', exempt: false },
    paid: true,
    status: 'en-revision',
    timeline: [
      {
        status: 'radicado',
        date: '2026-06-24',
        actor: 'Carolina Pérez García',
        note: 'Solicitud radicada en línea.',
      },
      {
        status: 'en-revision',
        date: '2026-06-26',
        actor: 'Funcionario J. Mora',
        note: 'Expediente asignado para revisión.',
      },
    ],
    submittedAt: '2026-06-24',
    slaDays: 8,
    daysLeft: 4,
  },
  {
    caseId: 'CASE-SEED-2',
    radicado: 'GOV-2026-10002',
    tramiteId: 'T-SISBEN',
    tramiteName: 'Actualización de datos en el Sisbén',
    entity: 'Departamento Nacional de Planeación',
    applicant: {
      name: 'Carolina Pérez García',
      docType: 'CC',
      docNumber: '52841903',
      email: 'carolina.perez@example.com',
      phone: '3005550187',
    },
    answers: { personasHogar: '4', cambioReportado: 'Nos mudamos de vivienda en mayo.' },
    documents: [],
    fee: { amount: 0, currency: 'COP', exempt: false },
    paid: false,
    status: 'subsanacion',
    timeline: [
      {
        status: 'radicado',
        date: '2026-06-18',
        actor: 'Carolina Pérez García',
        note: 'Solicitud radicada en línea.',
      },
      {
        status: 'en-revision',
        date: '2026-06-20',
        actor: 'Funcionaria L. Ríos',
        note: 'Expediente asignado para revisión.',
      },
      {
        status: 'subsanacion',
        date: '2026-06-27',
        actor: 'Funcionaria L. Ríos',
        note: 'Falta el recibo de un servicio público de la nueva vivienda.',
      },
    ],
    submittedAt: '2026-06-18',
    slaDays: 15,
    daysLeft: 6,
  },
  {
    caseId: 'CASE-SEED-3',
    radicado: 'GOV-2026-10003',
    tramiteId: 'T-ANTECEDENTES',
    tramiteName: 'Certificado de antecedentes judiciales',
    entity: 'Policía Nacional',
    applicant: {
      name: 'Carolina Pérez García',
      docType: 'CC',
      docNumber: '52841903',
      email: 'carolina.perez@example.com',
      phone: '3005550187',
    },
    answers: { motivoConsulta: 'laboral', aceptaTratamiento: 'true' },
    documents: [],
    fee: { amount: 0, currency: 'COP', exempt: false },
    paid: false,
    status: 'resuelto',
    timeline: [
      {
        status: 'radicado',
        date: '2026-06-30',
        actor: 'Carolina Pérez García',
        note: 'Solicitud radicada en línea.',
      },
      {
        status: 'en-revision',
        date: '2026-06-30',
        actor: 'Sistema',
        note: 'Verificación automática de antecedentes.',
      },
      {
        status: 'resuelto',
        date: '2026-06-30',
        actor: 'Sistema',
        note: 'Certificado generado. Disponible para descarga.',
      },
    ],
    submittedAt: '2026-06-30',
    slaDays: 1,
    daysLeft: 0,
  },
  {
    caseId: 'CASE-SEED-4',
    radicado: 'GOV-2026-10004',
    tramiteId: 'T-MATRICULA',
    tramiteName: 'Renovación de matrícula mercantil',
    entity: 'Cámara de Comercio',
    applicant: {
      name: 'Andrés Felipe Castro',
      docType: 'CC',
      docNumber: '80123456',
      email: 'andres.castro@example.com',
      phone: '3012223344',
    },
    answers: { nit: '901234567', activosTotales: '25000000' },
    documents: [{ id: 'D-2', name: 'estados-financieros.pdf', size: 512000 }],
    fee: { amount: 45000, currency: 'COP', exempt: false },
    paid: true,
    status: 'radicado',
    timeline: [
      {
        status: 'radicado',
        date: '2026-07-02',
        actor: 'Andrés Felipe Castro',
        note: 'Solicitud radicada en línea.',
      },
    ],
    submittedAt: '2026-07-02',
    slaDays: 3,
    daysLeft: 3,
  },
];

function mockSearch(q: string, category: string): TramiteSearchResult {
  const term = q.trim().toLowerCase();
  let tramites = MOCK_TRAMITES.map((detail) => detail.tramite);
  if (category) {
    tramites = tramites.filter((tramite) => tramite.category === category);
  }
  if (term) {
    tramites = tramites.filter(
      (tramite) =>
        tramite.name.toLowerCase().includes(term) ||
        tramite.entity.toLowerCase().includes(term) ||
        tramite.summary.toLowerCase().includes(term),
    );
  }
  return { tramites, total: tramites.length };
}

function mockDetail(id: string): TramiteDetail {
  return MOCK_TRAMITES.find((detail) => detail.tramite.id === id) ?? MOCK_TRAMITES[0];
}
