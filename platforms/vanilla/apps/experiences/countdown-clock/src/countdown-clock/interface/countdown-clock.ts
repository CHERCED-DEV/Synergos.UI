import { classNames } from '@synergos/shared';
import type { TimeRemaining } from '../domain/countdown.domain';
import type { CountdownState } from '../application/countdown.state';

const styles = `
  :host { display: block; }

  .sg-countdown-clock {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #0f172a;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 2rem;
    text-align: center;
  }

  .sg-countdown-clock--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-countdown-clock__label {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin: 0 0 1.5rem;
  }

  .sg-countdown-clock--dark .sg-countdown-clock__label {
    color: #94a3b8;
  }

  .sg-countdown-clock__units {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .sg-countdown-clock__unit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    min-width: 4rem;
  }

  .sg-countdown-clock__value {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
  }

  .sg-countdown-clock__name {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
  }

  .sg-countdown-clock--dark .sg-countdown-clock__name {
    color: #94a3b8;
  }

  .sg-countdown-clock__expired {
    font-size: 1.25rem;
    font-weight: 700;
    color: #ef4444;
    margin: 0;
  }
`;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildHTML(remaining: TimeRemaining, label: string, theme: string): string {
  const rootClass = classNames(
    'sg-countdown-clock',
    theme === 'dark' && 'sg-countdown-clock--dark',
  );

  if (remaining.expired) {
    return `
      <style>${styles}</style>
      <div class="${rootClass}">
        <p class="sg-countdown-clock__expired">¡Tiempo agotado!</p>
      </div>
    `;
  }

  return `
    <style>${styles}</style>
    <div class="${rootClass}">
      ${label ? `<p class="sg-countdown-clock__label">${label}</p>` : ''}
      <div class="sg-countdown-clock__units">
        <div class="sg-countdown-clock__unit">
          <span class="sg-countdown-clock__value">${pad(remaining.days)}</span>
          <span class="sg-countdown-clock__name">días</span>
        </div>
        <div class="sg-countdown-clock__unit">
          <span class="sg-countdown-clock__value">${pad(remaining.hours)}</span>
          <span class="sg-countdown-clock__name">horas</span>
        </div>
        <div class="sg-countdown-clock__unit">
          <span class="sg-countdown-clock__value">${pad(remaining.minutes)}</span>
          <span class="sg-countdown-clock__name">min</span>
        </div>
        <div class="sg-countdown-clock__unit">
          <span class="sg-countdown-clock__value">${pad(remaining.seconds)}</span>
          <span class="sg-countdown-clock__name">seg</span>
        </div>
      </div>
    </div>
  `;
}

export function render(
  host: ShadowRoot,
  state: CountdownState,
  label: string,
  theme: string,
): () => void {
  function update(remaining: TimeRemaining): void {
    host.innerHTML = buildHTML(remaining, label, theme);
  }

  update(state.current);
  const unsubscribe = state.subscribe(update);
  const stopInterval = state.start();

  return () => {
    unsubscribe();
    stopInterval();
  };
}
