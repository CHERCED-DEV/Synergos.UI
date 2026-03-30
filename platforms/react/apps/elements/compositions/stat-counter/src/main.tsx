import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { StatCounter } from './stat-counter';

const TAG = 'synergos-stat-counter';
const OBSERVED = [
  'value', 'label', 'prefix', 'suffix',
  'icon', 'trend', 'trend-label',
  'variant', 'theme',
];

if (!customElements.get(TAG)) {
  class StatCounterElement extends HTMLElement {
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
      this.#root.render(createElement(StatCounter, props));
    }
  }

  customElements.define(TAG, StatCounterElement);
}
