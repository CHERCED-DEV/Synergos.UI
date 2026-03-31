import { describe, it, expect } from 'vitest';
import { render } from './hello-world';

describe('hello-world', () => {
  it('renders with default heading', () => {
    const div = document.createElement('div');
    const shadow = div.attachShadow({ mode: 'open' });

    render(shadow, { heading: 'Hello, Synergos!', message: '', theme: 'light' });

    expect(shadow.innerHTML).toContain('Hello, Synergos!');
    expect(shadow.querySelector('.sg-hello-world')).toBeTruthy();
  });

  it('renders with custom heading and message', () => {
    const div = document.createElement('div');
    const shadow = div.attachShadow({ mode: 'open' });

    render(shadow, { heading: 'Custom Title', message: 'A test message', theme: 'light' });

    expect(shadow.innerHTML).toContain('Custom Title');
    expect(shadow.innerHTML).toContain('A test message');
  });

  it('applies dark theme class', () => {
    const div = document.createElement('div');
    const shadow = div.attachShadow({ mode: 'open' });

    render(shadow, { heading: 'Dark', message: '', theme: 'dark' });

    expect(shadow.querySelector('.sg-hello-world--dark')).toBeTruthy();
  });
});
