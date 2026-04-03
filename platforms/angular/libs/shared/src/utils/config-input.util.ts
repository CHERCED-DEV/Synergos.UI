function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  return isRecord(value) ? (value as Partial<T>) : undefined;
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
