import { describe, it, expect } from 'vitest';

describe('StatCounter', () => {
  it('should be defined as a custom element', () => {
    expect(customElements.get('synergos-stat-counter')).toBeUndefined();
  });
});
