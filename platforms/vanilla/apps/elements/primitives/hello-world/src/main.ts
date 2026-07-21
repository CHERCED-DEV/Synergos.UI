import { render } from './hello-world';

const TAG = 'synergos-hello-world';
const OBSERVED = ['heading', 'message', 'theme'];

if (!customElements.get(TAG)) {
  class HelloWorldElement extends HTMLElement {
    static observedAttributes = OBSERVED;

    #shadow: ShadowRoot;

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() { this.#render(); }
    attributeChangedCallback() { this.#render(); }

    #render() {
      render(this.#shadow, {
        heading: this.getAttribute('heading') ?? 'Hello, Synergos!',
        message: this.getAttribute('message') ?? '',
        theme: this.getAttribute('theme') ?? 'light',
      });
    }
  }

  customElements.define(TAG, HelloWorldElement);
}
