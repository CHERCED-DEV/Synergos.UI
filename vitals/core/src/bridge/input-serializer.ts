/**
 * Serializes component inputs as HTML attributes (JSON strings).
 * Used when passing complex data through custom element attributes.
 */
export function serializeInput(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Deserializes an HTML attribute value back to a typed input.
 */
export function deserializeInput<T = unknown>(attr: string | null): T | null {
  if (attr === null || attr === '') return null;
  try {
    return JSON.parse(attr) as T;
  } catch {
    return attr as unknown as T;
  }
}

/**
 * Converts a record of inputs to HTML attribute key-value pairs.
 */
export function inputsToAttributes(inputs: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (value !== undefined && value !== null) {
      attrs[key] = serializeInput(value);
    }
  }
  return attrs;
}
