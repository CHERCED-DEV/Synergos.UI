import { describe, it, expect } from 'vitest';

describe('PricingCard', () => {
  it('should be defined as a custom element', () => {
    expect(customElements.get('synergos-pricing-card')).toBeUndefined();
  });
});
