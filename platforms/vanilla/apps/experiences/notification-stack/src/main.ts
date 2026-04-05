import { createLogger } from '@synergos/core';
import { adaptNotificationConfig } from './notification-stack/infrastructure/notification.adapter';
import { NotificationState } from './notification-stack/application/notification.state';
import { render } from './notification-stack/interface/notification-stack';
import type { NotificationConfig } from './notification-stack/infrastructure/notification.config';

const TAG = 'synergos-notification-stack';
const OBSERVED = ['config'];
const logger = createLogger('notification-stack');

if (!customElements.get(TAG)) {
  class NotificationStackElement extends HTMLElement {
    static observedAttributes = OBSERVED;

    #shadow: ShadowRoot;
    #cleanup: (() => void) | null = null;
    #timers: ReturnType<typeof setTimeout>[] = [];

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() { this.#mount(); }
    disconnectedCallback() { this.#teardown(); }
    attributeChangedCallback() { this.#teardown(); this.#mount(); }

    #mount() {
      let parsed: Partial<NotificationConfig> = {};
      try {
        const raw = this.getAttribute('config') ?? '';
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        logger.warn('Invalid config JSON');
      }

      const { notifications, theme } = adaptNotificationConfig(parsed);
      const state = new NotificationState(notifications);

      this.#cleanup = render(this.#shadow, state, theme);

      for (const n of notifications) {
        if (n.duration > 0) {
          const t = setTimeout(() => state.dismiss(n.id), n.duration);
          this.#timers.push(t);
        }
      }
    }

    #teardown() {
      this.#cleanup?.();
      for (const t of this.#timers) clearTimeout(t);
      this.#timers = [];
      this.#cleanup = null;
    }
  }

  customElements.define(TAG, NotificationStackElement);
}
