import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { ContentCarousel } from './content-carousel';

const TAG = 'synergos-content-carousel';
const OBSERVED = ['config'];

if (!customElements.get(TAG)) {
  class ContentCarouselElement extends HTMLElement {
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
      this.#root.render(createElement(ContentCarousel, { config: this.getAttribute('config') ?? '' }));
    }
  }

  customElements.define(TAG, ContentCarouselElement);
}
