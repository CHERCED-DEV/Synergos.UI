// ── Form Contracts ─────────────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Shared/FormModels.cs

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

export interface FormSubmissionResult {
  readonly success: boolean;
  readonly thankYouMessage?: string;
  readonly redirectUrl?: string;
  readonly errorMessage?: string;
}
