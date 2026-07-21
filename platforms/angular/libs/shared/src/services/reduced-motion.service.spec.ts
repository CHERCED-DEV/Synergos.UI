import { TestBed } from '@angular/core/testing';
import { ReducedMotionService } from './reduced-motion.service';

describe(ReducedMotionService.name, () => {
  const originalMatchMedia = window.matchMedia;
  let listeners: Array<(event: MediaQueryListEvent) => void>;

  beforeEach(() => {
    listeners = [];

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          if (typeof listener === 'function') {
            listeners.push(listener as unknown as (event: MediaQueryListEvent) => void);
          }
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    TestBed.configureTestingModule({
      providers: [ReducedMotionService],
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('adjusts timing helpers based on user preference', () => {
    const service = TestBed.inject(ReducedMotionService);
    expect(service.prefersReducedMotion()).toBe(false);

    listeners[0]?.({ matches: true } as MediaQueryListEvent);

    expect(service.getAnimationClass('syn-progress')).toBe('syn-progress--no-motion');
    expect(service.getTransitionDuration(250)).toBe(0);
  });
});
