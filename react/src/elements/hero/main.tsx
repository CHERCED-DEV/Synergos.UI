import React from 'react';
import ReactDOM from 'react-dom/client';
import { Hero } from './hero';
import styles from './hero.css?inline';

class SynergosHeroReact extends HTMLElement {
  private root: ReactDOM.Root | null = null;
  private shadow: ShadowRoot;

  static get observedAttributes() {
    return [
      'heading-text', 'heading-level', 'body', 'image-src', 'image-alt',
      'cta-label', 'cta-url', 'cta-target', 'variant', 'theme',
    ];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    this.shadow.appendChild(styleEl);

    const container = document.createElement('div');
    this.shadow.appendChild(container);

    this.root = ReactDOM.createRoot(container);
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }

  private render() {
    if (!this.root) return;
    this.root.render(
      React.createElement(Hero, {
        headingText: this.getAttribute('heading-text') ?? '',
        headingLevel: this.getAttribute('heading-level') ?? 'h1',
        body: this.getAttribute('body') ?? '',
        imageSrc: this.getAttribute('image-src') ?? '',
        imageAlt: this.getAttribute('image-alt') ?? '',
        ctaLabel: this.getAttribute('cta-label') ?? '',
        ctaUrl: this.getAttribute('cta-url') ?? '',
        ctaTarget: this.getAttribute('cta-target') ?? '_self',
        variant: this.getAttribute('variant') ?? 'default',
        theme: this.getAttribute('theme') ?? 'light',
      })
    );
  }
}

if (!customElements.get('synergos-hero')) {
  customElements.define('synergos-hero', SynergosHeroReact);
}
