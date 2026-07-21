import { describe, it, expect } from 'vitest';
import { mapCSharpTypeToTs } from './type-mapper';

describe('mapCSharpTypeToTs', () => {
  it('should map string', () => {
    expect(mapCSharpTypeToTs('string')).toBe('string');
  });

  it('should map int to number', () => {
    expect(mapCSharpTypeToTs('int')).toBe('number');
  });

  it('should map bool to boolean', () => {
    expect(mapCSharpTypeToTs('bool')).toBe('boolean');
  });

  it('should map DateTime to string', () => {
    expect(mapCSharpTypeToTs('DateTime')).toBe('string');
  });

  it('should map Guid to string', () => {
    expect(mapCSharpTypeToTs('Guid')).toBe('string');
  });

  it('should map JsonElement to Record<string, unknown>', () => {
    expect(mapCSharpTypeToTs('JsonElement')).toBe('Record<string, unknown>');
  });

  it('should pass through domain types', () => {
    expect(mapCSharpTypeToTs('Image')).toBe('Image');
    expect(mapCSharpTypeToTs('Link')).toBe('Link');
  });

  it('should map IReadOnlyList<T> to readonly T[]', () => {
    expect(mapCSharpTypeToTs('IReadOnlyList<string>')).toBe('readonly string[]');
  });

  it('should map nested generic lists', () => {
    expect(mapCSharpTypeToTs('IReadOnlyList<int>')).toBe('readonly number[]');
  });

  it('should map Dictionary to Record', () => {
    expect(mapCSharpTypeToTs('Dictionary<string, int>')).toBe('Record<string, number>');
  });

  it('should strip ViewModel suffix from unknown types', () => {
    expect(mapCSharpTypeToTs('HeroElementViewModel')).toBe('HeroElement');
  });

  it('should strip Model suffix from unknown types', () => {
    expect(mapCSharpTypeToTs('ContentHeadingModel')).toBe('ContentHeading');
  });

  it('should pass through unknown types as-is', () => {
    expect(mapCSharpTypeToTs('SomeCustomType')).toBe('SomeCustomType');
  });
});
