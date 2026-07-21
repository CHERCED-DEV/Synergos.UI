import { createLogger } from '@synergos/core';
import { adaptCountdownConfig } from './countdown-clock/infrastructure/countdown.adapter';
import { CountdownState } from './countdown-clock/application/countdown.state';
import { render } from './countdown-clock/interface/countdown-clock';
import type { CountdownConfig } from './countdown-clock/infrastructure/countdown.config';

const TAG = 'synergos-countdown-clock';
const OBSERVED = ['config'];
const logger = createLogger('countdown-clock');

if (!customElements.get(TAG)) {
  class CountdownClockElement extends HTMLElement {
    static observedAttributes = OBSERVED;

    #shadow: ShadowRoot;
    #cleanup: (() => void) | null = null;

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() { this.#mount(); }
    disconnectedCallback() { this.#cleanup?.(); this.#cleanup = null; }
    attributeChangedCallback() { this.#cleanup?.(); this.#mount(); }

    #mount() {
      let parsed: Partial<CountdownConfig> = {};
      try {
        const raw = this.getAttribute('config') ?? '';
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        logger.warn('Invalid config JSON');
      }

      const { targetDate, label, theme } = adaptCountdownConfig(parsed);
      const state = new CountdownState(targetDate);
      this.#cleanup = render(this.#shadow, state, label, theme);
    }
  }

  customElements.define(TAG, CountdownClockElement);
}
