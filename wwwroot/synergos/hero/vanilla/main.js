(function(){"use strict";const r=document.createElement("template");r.innerHTML=`
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
`;class h extends HTMLElement{static get observedAttributes(){return["heading-text","heading-level","body","image-src","image-alt","cta-label","cta-url","cta-target","variant","theme"]}constructor(){super(),this.attachShadow({mode:"open"}),this.shadowRoot.appendChild(r.content.cloneNode(!0))}connectedCallback(){this.render()}attributeChangedCallback(){this.render()}render(){const t=this.getAttribute("heading-text")||"",e=this.getAttribute("heading-level")||"h1",s=this.getAttribute("body")||"",i=this.getAttribute("image-src")||"",a=this.getAttribute("cta-label")||"",c=this.getAttribute("cta-url")||"",d=this.getAttribute("cta-target")||"_self",g=this.getAttribute("variant")||"default",u=this.getAttribute("theme")||"light",n=this.shadowRoot.querySelector(".hero");n.className=`hero sg-hero--${g} sg-hero--${u}`,i?n.style.backgroundImage=`url(${i})`:n.style.backgroundImage="";const m=this.shadowRoot.querySelector(".hero__content");let o="";if(t){const l=["h1","h2","h3"].includes(e)?e:"h1";o+=`<${l} class="hero__heading">${this.escapeHtml(t)}</${l}>`}s&&(o+=`<p class="hero__body">${this.escapeHtml(s)}</p>`),a&&c&&(o+=`<a class="hero__cta-link" href="${this.escapeHtml(c)}" target="${this.escapeHtml(d)}" rel="noopener noreferrer">
        <button class="syn-button syn-button--solid syn-button--lg">${this.escapeHtml(a)}</button>
      </a>`),m.innerHTML=o}escapeHtml(t){const e=document.createElement("div");return e.textContent=t,e.innerHTML}}customElements.get("synergos-hero")||customElements.define("synergos-hero",h)})();
