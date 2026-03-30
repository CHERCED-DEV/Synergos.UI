const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    display: block;
    font-family: inherit;
  }

  .hero {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 25rem;
    padding: 3rem 2rem;
    background-color: #ffffff;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    border-radius: 0.5rem;
    position: relative;
  }

  :host(.sg-hero--dark) .hero,
  .sg-hero--dark {
    background-color: #111827;
    color: #ffffff;
  }

  .hero__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
    max-width: 45rem;
    position: relative;
    z-index: 1;
  }

  .hero__heading {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1.2;
    color: #111827;
  }

  :host(.sg-hero--dark) .hero__heading { color: #ffffff; }

  .hero__body {
    margin: 0;
    font-size: 1.125rem;
    color: #6b7280;
    line-height: 1.75;
  }

  :host(.sg-hero--dark) .hero__body { color: #d1d5db; }

  .hero__cta-link { text-decoration: none; }

  .syn-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0.375rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .syn-button--solid {
    background-color: #2563eb;
    color: #ffffff;
  }

  .syn-button--solid:hover { background-color: #1d4ed8; }

  .syn-button--lg {
    padding: 0.75rem 1.5rem;
    font-size: 1.125rem;
  }
</style>
<section class="hero">
  <div class="hero__content"></div>
</section>
`;

class SynergosHeroVanilla extends HTMLElement {
  static get observedAttributes() {
    return [
      'heading-text', 'heading-level', 'body', 'image-src', 'image-alt',
      'cta-label', 'cta-url', 'cta-target', 'variant', 'theme',
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const headingText = this.getAttribute('heading-text') || '';
    const headingLevel = this.getAttribute('heading-level') || 'h1';
    const body = this.getAttribute('body') || '';
    const imageSrc = this.getAttribute('image-src') || '';
    const ctaLabel = this.getAttribute('cta-label') || '';
    const ctaUrl = this.getAttribute('cta-url') || '';
    const ctaTarget = this.getAttribute('cta-target') || '_self';
    const variant = this.getAttribute('variant') || 'default';
    const theme = this.getAttribute('theme') || 'light';

    const section = this.shadowRoot.querySelector('.hero');
    section.className = `hero sg-hero--${variant} sg-hero--${theme}`;

    if (imageSrc) {
      section.style.backgroundImage = `url(${imageSrc})`;
    } else {
      section.style.backgroundImage = '';
    }

    const content = this.shadowRoot.querySelector('.hero__content');
    let html = '';

    if (headingText) {
      const tag = ['h1', 'h2', 'h3'].includes(headingLevel) ? headingLevel : 'h1';
      html += `<${tag} class="hero__heading">${this.escapeHtml(headingText)}</${tag}>`;
    }

    if (body) {
      html += `<p class="hero__body">${this.escapeHtml(body)}</p>`;
    }

    if (ctaLabel && ctaUrl) {
      html += `<a class="hero__cta-link" href="${this.escapeHtml(ctaUrl)}" target="${this.escapeHtml(ctaTarget)}" rel="noopener noreferrer">
        <button class="syn-button syn-button--solid syn-button--lg">${this.escapeHtml(ctaLabel)}</button>
      </a>`;
    }

    content.innerHTML = html;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (!customElements.get('synergos-hero')) {
  customElements.define('synergos-hero', SynergosHeroVanilla);
}
