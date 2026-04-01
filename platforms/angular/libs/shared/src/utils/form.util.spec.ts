import {
  getFieldError,
  hasFieldError,
  parseIntegerInput,
  parseNumericInput,
  toInputValue,
  toSelectOptions,
} from './form.util';

describe('form.util', () => {
  it('serialises numbers for form controls', () => {
    expect(toInputValue(42)).toBe('42');
    expect(toInputValue(null)).toBe('');
  });

  it('parses numeric and integer inputs safely', () => {
    expect(parseNumericInput(' 3.5 ')).toBe(3.5);
    expect(parseNumericInput('')).toBeNull();
    expect(parseIntegerInput('8.9')).toBe(8);
  });

  it('resolves field errors by field name', () => {
    const errors = [
      { field: 'email', message: 'Required' },
      { field: 'name', message: 'Invalid' },
    ] as const;

    expect(getFieldError(errors, 'email')).toBe('Required');
    expect(hasFieldError(errors, 'name')).toBe(true);
    expect(hasFieldError(errors, 'age')).toBe(false);
  });

  it('maps tuples into select options', () => {
    expect(
      toSelectOptions([
        ['brand', 'Brand'],
        ['neutral', 'Neutral'],
      ] as const),
    ).toEqual([
      { value: 'brand', label: 'Brand' },
      { value: 'neutral', label: 'Neutral' },
    ]);
  });
});
