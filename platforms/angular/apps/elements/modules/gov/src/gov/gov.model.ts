/**
 * Domain model for the Gobierno/Trámites vertical's <c>&lt;synergos-gov&gt;</c> — a
 * citizen-services portal (GOV.UK + GOV.CO/SUIT/Ventanilla Única-style), both faces:
 * citizen (catálogo → ficha → radicar → radicado+QR → mi carpeta/seguimiento) and
 * officer (bandeja/cola → expediente → transiciones legales + nota).
 *
 * Corazón del dominio (gobierno-app-spec §1): el objeto transaccional es un
 * **expediente de larga vida con máquina de estados** — no una orden que confirma y
 * cierra. Las transiciones legales viven como DATO (`CASE_TRANSITIONS`), no como
 * `if`s repartidos, y el wizard de radicación se **renderiza desde la definición del
 * trámite** (`FormFieldDef[]`, patrón GOV.UK task-list) — cada trámite varía sin
 * tocar el módulo. La tasa es opcional: `fee.amount === 0` apaga el paso de pago.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

/** The high-level phase / route the portal is in. */
export type GovView =
  | 'catalog' // catálogo de trámites (home del dominio)
  | 'detail' // ficha del trámite (lenguaje claro)
  | 'apply' // wizard de radicación (data-driven)
  | 'receipt' // radicado + QR (confirmation page)
  | 'folder' // mi carpeta (bandeja del ciudadano)
  | 'case' // seguimiento del expediente (ciudadano)
  | 'queue' // bandeja/cola del funcionario
  | 'officer-case'; // expediente (funcionario)

/** Demo role-switch: citizen face vs officer console (same module, two faces). */
export type GovRole = 'citizen' | 'officer';

/** CO-first service taxonomy for the catalogue facets. */
export type TramiteCategory = 'identidad' | 'salud' | 'tributario' | 'vehiculos' | 'empresa';

/** Service channel: fully online, in-person, or mixed. */
export type TramiteChannel = 'en-linea' | 'presencial' | 'mixto';

/**
 * Case-file lifecycle — the audited state machine of the expediente:
 * radicado → en revisión → (requiere subsanación ⇄ en revisión) → resuelto/rechazado.
 */
export type CaseStatus = 'radicado' | 'en-revision' | 'subsanacion' | 'resuelto' | 'rechazado';

/** The steps of the radicación wizard (payment appears only when the fee > 0). */
export type ApplyStep = 'applicant' | 'form' | 'documents' | 'review' | 'payment';

/** Field types the data-driven form renderer supports (form-stepper contract + date). */
export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox';

// ─── Trámite definition (dirige el wizard — data, not code) ─────────────────────

/** One selectable option of a `select` field. */
export interface FormFieldOption {
  readonly value: string;
  readonly label: string;
}

/**
 * One field of the trámite's dynamic form. The wizard renders these — a new
 * trámite ships a new definition, never new component code.
 */
export interface FormFieldDef {
  /** Stable answer key (camelCase). */
  readonly key: string;
  readonly label: string;
  readonly type: FormFieldType;
  readonly required: boolean;
  /** Plain-language help under the label (lenguaje claro). */
  readonly hint: string;
  readonly placeholder: string;
  /** Options for `select` fields; empty otherwise. */
  readonly options: readonly FormFieldOption[];
}

/** Fee (tasa/derecho) of the trámite. `amount === 0` or `exempt` = free. */
export interface Fee {
  /** Amount in major units of `currency`. */
  readonly amount: number;
  readonly currency: string;
  readonly exempt: boolean;
}

/** One trámite card as returned by `GET /api/gov/tramites`. */
export interface TramiteSummary {
  readonly id: string;
  readonly name: string;
  /** Responsible public entity (entidad). */
  readonly entity: string;
  readonly category: TramiteCategory;
  readonly channel: TramiteChannel;
  /** Plain-language one-liner: qué es y para qué sirve. */
  readonly summary: string;
  /** Estimated resolution time in business days (SLA). */
  readonly estimatedDays: number;
  /** Fee amount in major units (0 = gratuito) — for the catalogue card. */
  readonly feeAmount: number;
  readonly currency: string;
}

/** Full detail as returned by `GET /api/gov/tramite/{id}`. */
export interface TramiteDetail {
  readonly tramite: TramiteSummary;
  /** Drives the dynamic "datos del trámite" step of the wizard. */
  readonly formDefinition: readonly FormFieldDef[];
  /** Plain-language checklist of required documents. */
  readonly requirements: readonly string[];
  readonly fee: Fee;
}

// ─── Application / case (expediente) ────────────────────────────────────────────

/** Identity data of the applicant (prefilled once-only in the demo). */
export interface ApplicantInfo {
  readonly name: string;
  readonly docType: string;
  readonly docNumber: string;
  readonly email: string;
  readonly phone: string;
}

/** A document attached to the application/expediente. */
export interface DocRef {
  readonly id: string;
  readonly name: string;
  /** Size in bytes (0 when unknown). */
  readonly size: number;
}

/** One audited entry of the expediente's timeline. */
export interface TimelineEntry {
  readonly status: CaseStatus;
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  readonly actor: string;
  readonly note: string;
}

/** The case file (expediente) — aggregate root returned by `GET /api/gov/case/{id}`. */
export interface GovCase {
  readonly caseId: string;
  /** Public consecutive number (número de radicado). */
  readonly radicado: string;
  readonly tramiteId: string;
  readonly tramiteName: string;
  readonly entity: string;
  readonly applicant: ApplicantInfo;
  readonly answers: Readonly<Record<string, string>>;
  readonly documents: readonly DocRef[];
  readonly fee: Fee;
  readonly paid: boolean;
  readonly status: CaseStatus;
  readonly timeline: readonly TimelineEntry[];
  /** ISO date of radicación. */
  readonly submittedAt: string;
  /** SLA in business days for the whole trámite. */
  readonly slaDays: number;
  /** Days left to the SLA (seeded/derived; 0 when closed). */
  readonly daysLeft: number;
}

// ─── API request/response shapes ────────────────────────────────────────────────

/** `GET /api/gov/tramites?q=&category=` response. */
export interface TramiteSearchResult {
  readonly tramites: readonly TramiteSummary[];
  readonly total: number;
}

/** `POST /api/gov/application` request body. */
export interface ApplicationRequest {
  readonly tramiteId: string;
  readonly applicant: ApplicantInfo;
  readonly answers: Readonly<Record<string, string>>;
  readonly paid: boolean;
}

/** `POST /api/gov/application` response. */
export interface ApplicationResult {
  readonly caseId: string;
  readonly radicado: string;
  readonly fee?: Fee;
}

/** `GET /api/gov/case/{id}` response. */
export interface CaseDetailResult {
  readonly case: GovCase;
  readonly status: CaseStatus;
  readonly timeline: readonly TimelineEntry[];
}

/** `POST /api/gov/case/{id}/transition` response. */
export interface TransitionResult {
  readonly status: CaseStatus;
}

// ─── Legal state machine (data — the single source of the transitions) ──────────

/**
 * Legal transitions of the expediente. Anything not listed here is illegal and
 * must be rejected (idempotence: re-applying the current status is a no-op).
 */
export const CASE_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  radicado: ['en-revision'],
  'en-revision': ['subsanacion', 'resuelto', 'rechazado'],
  subsanacion: ['en-revision'],
  resuelto: [],
  rechazado: [],
};

/** `true` when moving the expediente `from → to` is a legal transition. */
export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return (CASE_TRANSITIONS[from] ?? []).includes(to);
}

/** Terminal states — the expediente is closed and accepts no further action. */
export function isTerminal(status: CaseStatus): boolean {
  return (CASE_TRANSITIONS[status] ?? []).length === 0;
}

// ─── Plain-language labels (lenguaje claro — GOV.UK/WCAG first-class) ───────────

/** Status tag label shown to both faces. */
export const CASE_STATUS_LABELS: Readonly<Record<CaseStatus, string>> = {
  radicado: 'Radicado',
  'en-revision': 'En revisión',
  subsanacion: 'Requiere subsanación',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

/** Plain-language explanation of each status for the citizen (qué significa). */
export const CASE_STATUS_HINTS: Readonly<Record<CaseStatus, string>> = {
  radicado: 'Recibimos su solicitud. Pronto un funcionario la revisará.',
  'en-revision': 'Un funcionario está revisando su solicitud. No tiene que hacer nada.',
  subsanacion: 'Necesitamos que corrija o complete algo para poder continuar.',
  resuelto: 'Su trámite terminó. Ya puede descargar el resultado.',
  rechazado: 'Su solicitud no fue aprobada. Revise el motivo en el historial.',
};

/** Action label the officer sees for each legal target status. */
export const TRANSITION_ACTION_LABELS: Readonly<Record<CaseStatus, string>> = {
  radicado: 'Radicar',
  'en-revision': 'Pasar a revisión',
  subsanacion: 'Pedir subsanación',
  resuelto: 'Aprobar y resolver',
  rechazado: 'Rechazar',
};

/**
 * Demo profile used to prefill the applicant step (once-only, e-Estonia/Carpeta
 * Ciudadana pattern: never re-ask what the State already knows). Editable by the
 * citizen before submitting.
 */
export const ONCE_ONLY_PROFILE: ApplicantInfo = {
  name: 'Carolina Pérez García',
  docType: 'CC',
  docNumber: '52841903',
  email: 'carolina.perez@example.com',
  phone: '3005550187',
};
