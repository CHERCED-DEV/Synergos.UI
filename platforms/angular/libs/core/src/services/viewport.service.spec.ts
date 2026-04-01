import { TestBed } from '@angular/core/testing';
import { ViewportService } from './viewport.service';
import { WindowService } from './window.service';

describe(ViewportService.name, () => {
  let service: ViewportService;
  const innerWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const innerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');

  const setViewportSize = (width: number, height: number): void => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: height,
    });
  };

  beforeEach(() => {
    setViewportSize(1024, 768);
    document.documentElement.style.removeProperty('--vw');
    document.documentElement.style.removeProperty('--vh');

    TestBed.configureTestingModule({
      providers: [WindowService, ViewportService],
    });

    service = TestBed.inject(ViewportService);
  });

  afterEach(() => {
    if (innerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', innerWidthDescriptor);
    }

    if (innerHeightDescriptor) {
      Object.defineProperty(window, 'innerHeight', innerHeightDescriptor);
    }

    document.documentElement.style.removeProperty('--vw');
    document.documentElement.style.removeProperty('--vh');
  });

  it('captures the viewport and syncs css variables', () => {
    expect(service.width()).toBe(1024);
    expect(service.height()).toBe(768);
    expect(service.layout()).toBe('xl');
    expect(service.orientation()).toBe('landscape');
    expect(document.documentElement.style.getPropertyValue('--vw')).toBe('1024px');
    expect(document.documentElement.style.getPropertyValue('--vh')).toBe('7.68px');
  });

  it('updates snapshot values when refreshed', () => {
    setViewportSize(600, 900);

    service.refresh();

    expect(service.width()).toBe(600);
    expect(service.height()).toBe(900);
    expect(service.layout()).toBe('sm');
    expect(service.orientation()).toBe('portrait');
  });

  it('reads css breakpoint variables with fallback support', () => {
    document.documentElement.style.setProperty('--syn-breakpoint', '840px');

    expect(service.getCssBreakpoint('--syn-breakpoint')).toBe(840);
    expect(service.getCssBreakpoint('--missing-breakpoint', 920)).toBe(920);
  });
});
