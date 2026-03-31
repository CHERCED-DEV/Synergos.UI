import { classNames } from '@synergos/shared';

const styles = `
  :host { display: block; }

  .sg-hello-world {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    padding: 2rem;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #0f172a;
    text-align: center;
    transition: box-shadow 0.2s ease;
  }

  .sg-hello-world:hover {
    box-shadow: 0 0.5rem 1rem -0.25rem rgb(15 23 42 / 0.12);
  }

  .sg-hello-world--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-hello-world__heading {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    letter-spacing: -0.025em;
  }

  .sg-hello-world__message {
    font-size: 0.875rem;
    color: #64748b;
    margin: 0;
    line-height: 1.5;
  }

  .sg-hello-world--dark .sg-hello-world__message {
    color: #94a3b8;
  }
`;

export interface HelloWorldConfig {
  heading: string;
  message: string;
  theme: string;
}

export function render(host: ShadowRoot, config: HelloWorldConfig): void {
  const { heading = 'Hello, Synergos!', message = '', theme = 'light' } = config;

  const rootClass = classNames(
    'sg-hello-world',
    theme === 'dark' && 'sg-hello-world--dark',
  );

  host.innerHTML = `
    <style>${styles}</style>
    <article class="${rootClass}">
      <h2 class="sg-hello-world__heading">${heading}</h2>
      ${message ? `<p class="sg-hello-world__message">${message}</p>` : ''}
    </article>
  `;
}
