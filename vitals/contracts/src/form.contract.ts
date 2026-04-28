// ── Form Contracts ─────────────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Shared/FormModels.cs
// Outcome alineado con docs/contracts/dom-events.md (cap-220, ADR 0083).

import type { SynergosOutcome } from './host-bridge.contract';

export interface FormField {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly placeholder?: string;
  readonly required: boolean;
  /** Comma-separated values for select/radio/checkbox fields. */
  readonly options?: string;
  readonly validationPattern?: string;
  readonly width: 'full' | 'half' | string;
}

export interface FormDefinition {
  readonly formName: string;
  readonly formAlias: string;
  readonly submitLabel: string;
  readonly fields: readonly FormField[];
}

export interface FormSubmissionPayload {
  readonly formAlias: string;
  readonly fields: Record<string, string>;
}

export interface FormSubmissionResult {
  /** Backward-compat boolean. Equivalente a `outcome === 'success'`.
   *  Nuevos consumers usar `outcome` directamente para distinguir
   *  partial. */
  readonly success: boolean;

  /** Tri-state outcome alineado con CMS audit events (success | failure
   *  | partial). Optional para retro-compat con builds previos a
   *  cap-220 — falta hasta que el CMS lo emita en el response shape. */
  readonly outcome?: SynergosOutcome;

  readonly thankYouMessage?: string;
  readonly redirectUrl?: string;
  readonly errorMessage?: string;

  /** Para partial outcomes (e.g. bulk submission donde algunos pasos
   *  succeed y otros fail), lista los errores per field/step. */
  readonly partialErrors?: readonly {
    readonly field?: string;
    readonly stepIndex?: number;
    readonly message: string;
  }[];
}

/** Helper para resolver el outcome efectivo de un FormSubmissionResult
 *  — útil para legacy results que solo traen `success: boolean`. */
export function resolveFormOutcome(result: FormSubmissionResult): SynergosOutcome {
  if (result.outcome) return result.outcome;
  return result.success ? 'success' : 'failure';
}
