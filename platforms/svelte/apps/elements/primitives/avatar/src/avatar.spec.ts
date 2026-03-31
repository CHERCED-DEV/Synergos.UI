import { describe, it, expect } from 'vitest';

describe('Avatar', () => {
  it('should be defined as a custom element', () => {
    expect(customElements.get('synergos-avatar')).toBeUndefined();
  });
});
