export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface SelectOption<TValue extends string | number = string> {
  readonly value: TValue;
  readonly label: string;
}

export function toInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

export function parseNumericInput(rawValue: string): number | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function parseIntegerInput(rawValue: string): number | null {
  const numericValue = parseNumericInput(rawValue);
  return numericValue === null ? null : Math.trunc(numericValue);
}

export function getFieldError(
  errors: ReadonlyArray<FieldError>,
  fieldName: string,
): string | undefined {
  return errors.find((error) => error.field === fieldName)?.message;
}

export function hasFieldError(errors: ReadonlyArray<FieldError>, fieldName: string): boolean {
  return errors.some((error) => error.field === fieldName);
}

export function toSelectOptions<TValue extends string | number>(
  entries: ReadonlyArray<readonly [TValue, string]>,
): ReadonlyArray<SelectOption<TValue>> {
  return entries.map(([value, label]) => ({ value, label }));
}
