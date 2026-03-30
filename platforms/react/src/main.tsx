import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { PricingCard } from './elements/pricing-card/pricing-card';
import { StatCounter } from './elements/stat-counter/stat-counter';

type ComponentType = typeof PricingCard | typeof StatCounter;

function defineReactElement(tag: string, Component: ComponentType, observedAttrs: string[]) {
  if (customElements.get(tag)) return;

  class ReactElement extends HTMLElement {
    static observedAttributes = observedAttrs;

    #root: Root | null = null;
    #shadow: ShadowRoot;

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this.#mount();
    }

    disconnectedCallback() {
      this.#root?.unmount();
      this.#root = null;
    }

    attributeChangedCallback() {
      this.#mount();
    }

    #mount() {
      if (!this.#root) {
        this.#root = createRoot(this.#shadow);
      }

      const props: Record<string, string> = {};
      for (const attr of observedAttrs) {
        props[this.#attrToProp(attr)] = this.getAttribute(attr) ?? '';
      }

      this.#root.render(createElement(Component, props));
    }

    #attrToProp(attr: string): string {
      return attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }
  }

  customElements.define(tag, ReactElement);
}

// ── Register elements ─────────────────────────────────────────────────────────

defineReactElement('synergos-pricing-card', PricingCard, [
  'plan-name', 'price', 'period', 'features',
  'cta-label', 'cta-url', 'highlighted',
  'variant', 'theme',
]);

defineReactElement('synergos-stat-counter', StatCounter, [
  'value', 'label', 'prefix', 'suffix',
  'icon', 'trend', 'trend-label',
  'variant', 'theme',
]);
