import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { QuizFlow } from './quiz-flow';

const TAG = 'synergos-quiz-flow';
const OBSERVED = ['config'];

if (!customElements.get(TAG)) {
  class QuizFlowElement extends HTMLElement {
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
      this.#root.render(createElement(QuizFlow, { config: this.getAttribute('config') ?? '' }));
    }
  }

  customElements.define(TAG, QuizFlowElement);
}
