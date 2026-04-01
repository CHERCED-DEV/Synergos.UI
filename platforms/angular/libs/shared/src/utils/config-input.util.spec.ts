import { describe, expect, it } from 'vitest';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  resolveConfigArray,
  resolveConfigValue,
} from './config-input.util';

describe('config-input util', () => {
  it('parses json config strings', () => {
    expect(coerceConfigInput<{ title: string }>('{"title":"Hero"}')).toEqual({
      title: 'Hero',
    });
  });

  it('returns undefined for invalid config values', () => {
    expect(coerceConfigInput('not-json')).toBeUndefined();
    expect(coerceConfigInput(42)).toBeUndefined();
  });

  it('prefers explicit overrides over config values', () => {
    expect(resolveConfigValue('', 'Fallback label', 'Default label')).toBe('');
    expect(resolveConfigValue(undefined, 'Fallback label', 'Default label')).toBe('Fallback label');
  });

  it('resolves arrays from overrides first and falls back to config', () => {
    expect(resolveConfigArray([{ id: 1 }], [{ id: 2 }])).toEqual([{ id: 1 }]);
    expect(resolveConfigArray(undefined, [{ id: 2 }])).toEqual([{ id: 2 }]);
    expect(resolveConfigArray(undefined, undefined)).toEqual([]);
  });

  it('coerces optional boolean inputs without masking missing values', () => {
    expect(coerceOptionalBooleanInput(undefined)).toBeUndefined();
    expect(coerceOptionalBooleanInput('')).toBe(true);
    expect(coerceOptionalBooleanInput('false')).toBe(false);
  });

  it('coerces optional number inputs without defaulting missing values', () => {
    expect(coerceOptionalNumberInput(undefined)).toBeUndefined();
    expect(coerceOptionalNumberInput('3')).toBe(3);
    expect(coerceOptionalNumberInput('oops')).toBeUndefined();
  });
});
