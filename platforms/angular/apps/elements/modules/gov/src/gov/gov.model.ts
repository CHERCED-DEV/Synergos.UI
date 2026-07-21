/**
 * Domain model for the Gobierno vertical's <c>&lt;synergos-gov&gt;</c> — a
 * citizen-services portal (GOV.UK service-manual + GOV.CO/SUIT/Ventanilla Única),
 * two faces via role-switch:
 *
 *  - **CIUDADANO:** discovery de trámites (SH-1) → ficha (task-list: pasos,
 *    elegibilidad, requisitos, fee) → iniciar solicitud (SH-9 dynamic form +
 *    check-answers) → mis solicitudes (SH-4 + timeline) → detalle (timeline +
 *    documentos + correspondencia SH-7) → subir documento.
 *  - **FUNCIONARIO:** cola de casos (SH-5: filtros por agencia/estado, SLA,
 *    prioridad) → revisar caso → decisión (aprobar/rechazar/pedir info + nota).
 *
 * **Contrato API EXACTO (Ola 8):** the field names below mirror the backend 1:1
 * (`feeMinor`, `currency`, `reference`, `currentStage`, `slaDaysLeft`, `outcome`…)
 * — the module NEVER invents keys (lección Ola 7). Pure TS, no Angular imports.
 */

/** The high-level view the SPA is on (hash-routable). */
export type GovView =
  | 'catalog' // discovery de trámites (SH-1)
  | 'service' // ficha del trámite (task-list)
  | 'apply' // iniciar solicitud (SH-9 dynamic form)
  | 'receipt' // solicitud radicada (confirmation)
  | 'applications' // mis solicitudes (SH-4)
  | 'application' // detalle de una solicitud (timeline + docs + SH-7)
  | 'queue' // cola de casos del funcionario (SH-5)
  | 'case'; // revisar caso + decisión

/** Demo role-switch: citizen face vs officer console. */
export type GovRole = 'citizen' | 'officer';

// ─── Catálogo (GET /services, GET /service/{id}) ────────────────────────────────

/** One trámite card — `GET /api/gov/services` item. */
export interface GovService {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly category: string;
  readonly agency: string;
  /** Estimated resolution time in business days (SLA). */
  readonly estimatedDays: number;
  /** Fee in minor units (0 = gratuito). */
  readonly feeMinor: number;
  readonly currency: string;
}

/** One step of the trámite's task-list (ficha). */
export interface ServiceStep {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

/** Full detail — `GET /api/gov/service/{id}` → `service`. */
export interface GovServiceDetail {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly category: string;
  readonly agency: string;
  readonly steps: readonly ServiceStep[];
  readonly eligibility: readonly string[];
  readonly required: readonly string[];
  readonly feeMinor: number;
  readonly currency: string;
}

// ─── Formulario dinámico (GET /form/{serviceId}) ────────────────────────────────

export type GovFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'email'
  | 'tel';

export interface GovFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface GovFormField {
  readonly id: string;
  readonly label: string;
  readonly type: GovFieldType;
  readonly required?: boolean;
  readonly help?: string;
  readonly options?: readonly GovFieldOption[];
  readonly pattern?: string;
}

export interface GovFormSection {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly GovFormField[];
}

/** `GET /api/gov/form/{serviceId}` → `form`. Feeds SH-9 1:1. */
export interface GovForm {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly GovFormSection[];
}

// ─── Solicitud / expediente (application / case) ────────────────────────────────

/** Application status (citizen-facing lifecycle). */
export type ApplicationStatus =
  | 'submitted'
  | 'in-review'
  | 'info-requested'
  | 'approved'
  | 'rejected';

/** State of one timeline node. */
export type TimelineState = 'done' | 'current' | 'pending';

/** Officer decision outcome (`POST /api/gov/decision`). */
export type DecisionOutcome = 'approve' | 'reject' | 'request-info';

/** Summary — `GET /api/gov/applications` item + `POST /api/gov/application` result. */
export interface ApplicationSummary {
  readonly id: string;
  readonly reference: string;
  readonly serviceId?: string;
  readonly serviceName: string;
  readonly status: ApplicationStatus;
  /** ISO datetime the application was submitted. */
  readonly submittedAt: string;
  readonly currentStage: string;
}

/** One timeline node of the expediente. */
export interface TimelineEntry {
  readonly id: string;
  readonly label: string;
  /** ISO date (may be empty for pending nodes). */
  readonly date: string;
  readonly state: TimelineState;
  readonly note?: string;
}

/** A document attached to the expediente. */
export interface GovDocument {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  /** ISO datetime. */
  readonly uploadedAt: string;
  readonly contentType?: string;
  readonly sizeBytes?: number;
  /**
   * Ruta de descarga, presente SOLO si hay un binario detrás (T6). Los documentos
   * sembrados antes de T6 son metadata sin fichero y llegan sin esto: la UI los pinta
   * como texto en vez de ofrecer una descarga que daría 404.
   */
  readonly downloadUrl?: string;
}

/** One correspondence message (SH-7). */
export interface GovMessage {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly createdAtUtc: string;
  /** `true` = outgoing (from the citizen / the current actor). */
  readonly outgoing: boolean;
}

/** Full application detail — `GET /api/gov/application/{id}` → `application`. */
export interface ApplicationDetail {
  readonly id: string;
  readonly reference: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly status: ApplicationStatus;
  readonly submittedAt: string;
  readonly currentStage: string;
  readonly timeline: readonly TimelineEntry[];
  readonly documents: readonly GovDocument[];
  readonly messages: readonly GovMessage[];
}

/** One row of the officer queue — `GET /api/gov/queue` item. */
export interface QueueCase {
  readonly id: string;
  readonly reference: string;
  readonly serviceName: string;
  readonly citizenName: string;
  readonly status: ApplicationStatus;
  readonly submittedAt: string;
  /** `low` | `normal` | `high` | `urgent` — free-form from the backend. */
  readonly priority: string;
  /** Days left to the SLA (negative = overdue). */
  readonly slaDaysLeft: number;
}

/** Answers pair for the officer's case review. */
export interface AnswerPair {
  readonly label: string;
  readonly value: string;
}

/** The officer decision recorded on the case, if any. */
export interface CaseDecision {
  readonly outcome: DecisionOutcome;
  readonly note: string;
  readonly decidedAtUtc?: string;
}

/** The application core shown in the officer case view. */
export interface CaseApplication {
  readonly id: string;
  readonly reference: string;
  readonly serviceName: string;
  readonly citizenName: string;
  readonly status: ApplicationStatus;
  readonly submittedAt: string;
  readonly currentStage: string;
}

/** Full case — `GET /api/gov/case/{id}` → `case` (+ `POST /decision`). */
export interface GovCase {
  readonly application: CaseApplication;
  readonly answers: readonly AnswerPair[];
  readonly documents: readonly GovDocument[];
  readonly timeline: readonly TimelineEntry[];
  readonly decision?: CaseDecision;
}

// ─── Request bodies ─────────────────────────────────────────────────────────────

/** `POST /api/gov/application` body. */
export interface CreateApplicationRequest {
  readonly serviceId: string;
  readonly answers: Readonly<Record<string, string>>;
}

/**
 * `POST /api/gov/document` — desde T6 va como **multipart**, no JSON: el fichero de
 * verdad viaja aquí. Antes solo iba el `name` y el binario se quedaba en el navegador.
 */
export interface UploadDocumentRequest {
  readonly applicationId: string;
  readonly file: File;
}

/** `POST /api/gov/decision` body. */
export interface DecisionRequest {
  readonly caseId: string;
  readonly outcome: DecisionOutcome;
  readonly note: string;
}

// ─── Response envelopes ─────────────────────────────────────────────────────────

export interface ServicesResponse {
  readonly services: readonly GovService[];
}
export interface ServiceResponse {
  readonly service: GovServiceDetail;
}
export interface FormResponse {
  readonly form: GovForm;
}
export interface ApplicationCreatedResponse {
  readonly application: ApplicationSummary;
}
export interface ApplicationsResponse {
  readonly applications: readonly ApplicationSummary[];
}
export interface ApplicationResponse {
  readonly application: ApplicationDetail;
}
export interface DocumentResponse {
  readonly document: GovDocument;
}
export interface QueueResponse {
  readonly cases: readonly QueueCase[];
}
export interface CaseResponse {
  readonly case: GovCase;
}

// ─── Plain-language labels (lenguaje claro — GOV.UK/WCAG first-class) ────────────

export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  submitted: 'Radicada',
  'in-review': 'En revisión',
  'info-requested': 'Requiere información',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/** Plain-language explanation of each status for the citizen (qué significa). */
export const STATUS_HINTS: Readonly<Record<ApplicationStatus, string>> = {
  submitted: 'Recibimos su solicitud. Pronto un funcionario la revisará.',
  'in-review': 'Un funcionario está revisando su solicitud. No tiene que hacer nada.',
  'info-requested': 'Necesitamos que corrija o complete algo para poder continuar.',
  approved: 'Su trámite terminó. Ya puede descargar el resultado.',
  rejected: 'Su solicitud no fue aprobada. Revise el motivo en el historial.',
};

/** The officer decision action labels. */
export const OUTCOME_LABELS: Readonly<Record<DecisionOutcome, string>> = {
  approve: 'Aprobar',
  reject: 'Rechazar',
  'request-info': 'Pedir información',
};

/** The status an outcome moves the application to. */
export const OUTCOME_TO_STATUS: Readonly<Record<DecisionOutcome, ApplicationStatus>> = {
  approve: 'approved',
  reject: 'rejected',
  'request-info': 'info-requested',
};

/** `true` when the application is closed (no further officer action). */
export function isClosedStatus(status: ApplicationStatus): boolean {
  return status === 'approved' || status === 'rejected';
}
