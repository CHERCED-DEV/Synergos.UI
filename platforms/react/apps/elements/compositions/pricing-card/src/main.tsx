import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { PricingCard } from './pricing-card';

const TAG = 'synergos-pricing-card';
const OBSERVED = [
  'plan-name', 'price', 'period', 'features',
  'cta-label', 'cta-url', 'highlighted',
  'variant', 'theme',
];

if (!customElements.get(TAG)) {
  class PricingCardElement extends HTMLElement {
    static observedAttributes = OBSERVED;

    #root: Root | null = null;
    #shadow: ShadowRoot;

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() { this.#render(); }
    disconnectedCallback() { this.#root?.unmount(); this.#root = null; }
    attributeChangedCallback() { this.#render(); }

    #render() {
      if (!this.#root) this.#root = createRoot(this.#shadow);
      const props: Record<string, string> = {};
      for (const attr of OBSERVED) {
        props[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] =
          this.getAttribute(attr) ?? '';
      }
      this.#root.render(createElement(PricingCard, props));
    }
  }

  customElements.define(TAG, PricingCardElement);
}
