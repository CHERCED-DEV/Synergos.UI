function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function omitUndefinedProperties<T extends object>(value: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}

function sanitizeRecord<T extends object>(value: Record<string, unknown>): Partial<T> {
  return omitUndefinedProperties(value as Partial<T>);
}

export function coerceConfigInput<T extends object>(value: unknown): Partial<T> | undefined {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return undefined;
    }

    try {
      return coerceConfigInput<T>(JSON.parse(trimmedValue));
    } catch {
      return undefined;
    }
  }

  return isRecord(value) ? sanitizeRecord<T>(value) : undefined;
}

export type ConfigInputSanitizer<T extends object> = (value: Partial<T>) => Partial<T> | undefined;

export function createConfigInputTransform<T extends object>(
  sanitizer?: ConfigInputSanitizer<T>,
): (value: unknown) => Partial<T> | undefined {
  return (value: unknown): Partial<T> | undefined => {
    const coercedValue = coerceConfigInput<T>(value);
    if (!coercedValue) {
      return undefined;
    }

    return sanitizer ? sanitizer(coercedValue) : coercedValue;
  };
}

export function resolveConfigValue<T>(
  overrideValue: T | undefined,
  configValue: T | undefined,
  fallbackValue: T,
): T {
  return overrideValue ?? configValue ?? fallbackValue;
}

export function resolveConfigArray<T>(
  overrideValue: readonly T[] | undefined,
  configValue: readonly T[] | undefined,
): readonly T[] {
  return overrideValue ?? configValue ?? [];
}

export function coerceOptionalBooleanInput(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (!normalizedValue) {
      return true;
    }

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return undefined;
}

export function coerceTrimmedStringInput(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function coerceStringEnumInput<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): T | undefined {
  const normalizedValue = coerceTrimmedStringInput(value)?.toLowerCase();
  if (!normalizedValue) {
    return undefined;
  }

  return allowedValues.find((allowedValue) => allowedValue === normalizedValue) as T | undefined;
}

export function coerceStringRecordInput(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    ([key, entryValue]) => typeof key === 'string' && typeof entryValue === 'string',
  ) as Array<[string, string]>;

  return entries.length > 0 ? Object.fromEntries(entries) as Record<string, string> : undefined;
}

export function resolveHeadingTone(theme: string | null | undefined): 'neutral' | 'inverse' {
  return theme === 'dark' ? 'inverse' : 'neutral';
}

export function coerceOptionalNumberInput(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
}
