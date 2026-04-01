import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DeviceCompatibilityService,
  type DeviceCompatibilityResult,
} from './device-compatibility.service';
import {
  DeviceContextService,
  type DeviceContextSnapshot,
} from './device-context.service';

describe(DeviceCompatibilityService.name, () => {
  const snapshot = signal<DeviceContextSnapshot>({
    browser: 'chrome',
    device: 'desktop',
    displayMode: 'browser',
    language: 'en-US',
    online: true,
    operatingSystem: 'windows',
    touch: false,
    userAgent: 'desktop',
  });

  beforeEach(() => {
    snapshot.set({
      browser: 'chrome',
      device: 'desktop',
      displayMode: 'browser',
      language: 'en-US',
      online: true,
      operatingSystem: 'windows',
      touch: false,
      userAgent: 'desktop',
    });

    TestBed.configureTestingModule({
      providers: [
        DeviceCompatibilityService,
        {
          provide: DeviceContextService,
          useValue: {
            snapshot,
          },
        },
      ],
    });
  });

  it('accepts compatible environments', () => {
    const service = TestBed.inject(DeviceCompatibilityService);

    expect(
      service.isCompatible({
        browsers: { allowed: ['chrome', 'edge'] },
        devices: { allowed: ['desktop'] },
      }),
    ).toBe(true);
  });

  it('returns reasons when the environment is blocked', () => {
    const service = TestBed.inject(DeviceCompatibilityService);
    const result: DeviceCompatibilityResult = service.evaluate({
      browsers: { blocked: ['chrome'] },
      requireTouch: true,
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons).toContain('The current browser is blocked.');
    expect(result.reasons).toContain('Touch input is required.');
  });
});
