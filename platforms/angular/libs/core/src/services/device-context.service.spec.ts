import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  DeviceContextService,
  type DeviceContextSnapshot,
} from './device-context.service';
import { WindowService } from './window.service';

describe(DeviceContextService.name, () => {
  const createWindowStub = (
    snapshot: Partial<DeviceContextSnapshot> = {},
    standalone = false,
  ): Window => {
    const mediaQuery = {
      addEventListener: vi.fn(),
      matches: standalone,
      removeEventListener: vi.fn(),
    };

    return {
      addEventListener: vi.fn(),
      matchMedia: vi.fn(() => mediaQuery),
      navigator: {
        language: snapshot.language ?? 'en-US',
        maxTouchPoints: snapshot.touch ? 2 : 0,
        onLine: snapshot.online ?? true,
        standalone,
        userAgent:
          snapshot.userAgent ??
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      },
      removeEventListener: vi.fn(),
    } as unknown as Window;
  };

  const configure = (windowRef: Window): DeviceContextService => {
    TestBed.configureTestingModule({
      providers: [
        DeviceContextService,
        {
          provide: WindowService,
          useValue: {
            getWindow: () => windowRef,
          },
        },
      ],
    });

    return TestBed.inject(DeviceContextService);
  };

  it('captures desktop browser information', () => {
    const service = configure(createWindowStub());

    expect(service.browser()).toBe('chrome');
    expect(service.operatingSystem()).toBe('windows');
    expect(service.device()).toBe('desktop');
    expect(service.displayMode()).toBe('browser');
    expect(service.touch()).toBe(false);
  });

  it('detects mobile standalone contexts', () => {
    const service = configure(
      createWindowStub(
        {
          touch: true,
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        },
        true,
      ),
    );

    expect(service.browser()).toBe('safari');
    expect(service.operatingSystem()).toBe('ios');
    expect(service.device()).toBe('mobile');
    expect(service.displayMode()).toBe('standalone');
    expect(service.touch()).toBe(true);
  });

  it('refreshes the snapshot when the environment changes', () => {
    const windowRef = createWindowStub();
    const service = configure(windowRef);

    Object.assign(windowRef.navigator, {
      onLine: false,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
    });

    service.refresh();

    expect(service.online()).toBe(false);
    expect(service.operatingSystem()).toBe('android');
    expect(service.device()).toBe('tablet');
  });
});
