import { classNames } from '@synergos/shared';
import type { Notification } from '../domain/notification.domain';
import type { NotificationState } from '../application/notification.state';

const ICON: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
};

const styles = `
  :host { display: block; }

  .sg-notification-stack {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .sg-notification {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid transparent;
    animation: sg-slide-in 0.2s ease;
  }

  @keyframes sg-slide-in {
    from { opacity: 0; transform: translateY(-0.25rem); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .sg-notification--info    { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
  .sg-notification--success { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
  .sg-notification--warning { background: #fffbeb; border-color: #fde68a; color: #92400e; }
  .sg-notification--error   { background: #fef2f2; border-color: #fecaca; color: #991b1b; }

  .sg-notification-stack--dark .sg-notification--info    { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
  .sg-notification-stack--dark .sg-notification--success { background: #14532d; border-color: #16a34a; color: #86efac; }
  .sg-notification-stack--dark .sg-notification--warning { background: #451a03; border-color: #d97706; color: #fcd34d; }
  .sg-notification-stack--dark .sg-notification--error   { background: #450a0a; border-color: #dc2626; color: #fca5a5; }

  .sg-notification__icon {
    font-size: 1rem;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .sg-notification__message {
    flex: 1;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .sg-notification__dismiss {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
    color: inherit;
    opacity: 0.6;
    flex-shrink: 0;
    transition: opacity 0.15s ease;
  }

  .sg-notification__dismiss:hover {
    opacity: 1;
  }
`;

function buildItem(n: Notification): string {
  return `
    <div class="sg-notification sg-notification--${n.type}">
      <span class="sg-notification__icon">${ICON[n.type] ?? 'ℹ'}</span>
      <span class="sg-notification__message">${n.message}</span>
      <button
        class="sg-notification__dismiss"
        data-id="${n.id}"
        type="button"
        aria-label="Cerrar"
      >×</button>
    </div>
  `;
}

export function render(
  host: ShadowRoot,
  state: NotificationState,
  theme: string,
): () => void {
  function update(items: Notification[]): void {
    const rootClass = classNames(
      'sg-notification-stack',
      theme === 'dark' && 'sg-notification-stack--dark',
    );

    host.innerHTML = `
      <style>${styles}</style>
      <div class="${rootClass}">
        ${items.map(buildItem).join('')}
      </div>
    `;

    host.querySelectorAll<HTMLButtonElement>('.sg-notification__dismiss').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['id'];
        if (id) state.dismiss(id);
      });
    });
  }

  update(state.items);
  return state.subscribe(update);
}
