import { TestBed } from '@angular/core/testing';
import { VisualViewportService } from './visual-viewport.service';
import { WindowService } from './window.service';

class FakeVisualViewport extends EventTarget {
  width = 360;
  height = 640;
  offsetLeft = 0;
  offsetTop = 0;
  pageLeft = 0;
  pageTop = 0;
  scale = 1;
}

describe(VisualViewportService.name, () => {
  let service: VisualViewportService;
  let visualViewport: FakeVisualViewport;
  const originalVisualViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');

  beforeEach(() => {
    visualViewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });

    TestBed.configureTestingModule({
      providers: [WindowService, VisualViewportService],
    });

    service = TestBed.inject(VisualViewportService);
  });

  afterEach(() => {
    if (originalVisualViewportDescriptor) {
      Object.defineProperty(window, 'visualViewport', originalVisualViewportDescriptor);
      return;
    }

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });

  it('captures visual viewport values', () => {
    expect(service.supported()).toBe(true);
    expect(service.width()).toBe(360);
    expect(service.height()).toBe(640);
    expect(service.scale()).toBe(1);
  });

  it('updates its snapshot when the visual viewport changes', () => {
    visualViewport.width = 320;
    visualViewport.height = 540;
    visualViewport.scale = 2;
    visualViewport.dispatchEvent(new Event('resize'));

    expect(service.width()).toBe(320);
    expect(service.height()).toBe(540);
    expect(service.scale()).toBe(2);
  });
});
