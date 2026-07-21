import { TestBed } from '@angular/core/testing';
import { AnchorScrollService } from './anchor-scroll.service';
import { WindowService } from './window.service';

describe(AnchorScrollService.name, () => {
  let service: AnchorScrollService;
  let scrollToSpy: ReturnType<typeof vi.spyOn>;
  const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');

  beforeEach(() => {
    document.body.innerHTML = `
      <a id="scroll-link" href="#target">Go to target</a>
      <section id="target"></section>
    `;

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 120,
    });

    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(document.getElementById('target') as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 240,
      top: 240,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    });

    TestBed.configureTestingModule({
      providers: [WindowService, AnchorScrollService],
    });

    service = TestBed.inject(AnchorScrollService);
  });

  afterEach(() => {
    scrollToSpy.mockRestore();
    document.body.innerHTML = '';

    if (scrollYDescriptor) {
      Object.defineProperty(window, 'scrollY', scrollYDescriptor);
    }
  });

  it('scrolls to a fragment with a top offset', () => {
    expect(service.scrollToFragment('target', { offsetTop: 40 })).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 320,
      left: 0,
      behavior: 'smooth',
    });
  });

  it('binds anchor clicks and returns a cleanup function', () => {
    const cleanup = service.bindAnchors({ offsetTop: 20 });

    (document.getElementById('scroll-link') as HTMLAnchorElement).click();

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 340,
      left: 0,
      behavior: 'smooth',
    });

    cleanup();
  });
});
