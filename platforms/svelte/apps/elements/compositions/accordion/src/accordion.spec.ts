import { describe, it, expect } from 'vitest';

describe('Accordion', () => {
  it('should be defined as a custom element', () => {
    expect(customElements.get('synergos-accordion')).toBeUndefined();
  });
});
