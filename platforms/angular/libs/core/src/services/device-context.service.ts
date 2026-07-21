import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { WindowService } from './window.service';

export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'unknown';
export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'opera' | 'safari' | 'unknown';
export type OperatingSystemKind =
  | 'android'
  | 'ios'
  | 'linux'
  | 'macos'
  | 'unknown'
  | 'windows';
export type DisplayModeKind = 'browser' | 'standalone';

export interface DeviceContextSnapshot {
  readonly browser: BrowserKind;
  readonly device: DeviceKind;
  readonly displayMode: DisplayModeKind;
  readonly language: string;
  readonly online: boolean;
  readonly operatingSystem: OperatingSystemKind;
  readonly touch: boolean;
  readonly userAgent: string;
}

type NavigatorRecord = Navigator & {
  readonly standalone?: boolean;
};

@Injectable({ providedIn: 'root' })
export class DeviceContextService {
  readonly #destroyRef = inject(DestroyRef);
  readonly #window = inject(WindowService);
  readonly #displayModeQuery = this.resolveDisplayModeQuery();
  readonly #snapshot = signal<DeviceContextSnapshot>(this.captureSnapshot());

  readonly snapshot = this.#snapshot.asReadonly();
  readonly browser = computed(() => this.#snapshot().browser);
  readonly device = computed(() => this.#snapshot().device);
  readonly displayMode = computed(() => this.#snapshot().displayMode);
  readonly language = computed(() => this.#snapshot().language);
  readonly online = computed(() => this.#snapshot().online);
  readonly operatingSystem = computed(() => this.#snapshot().operatingSystem);
  readonly touch = computed(() => this.#snapshot().touch);

  constructor() {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return;
    }

    windowRef.addEventListener('online', this.refresh, { passive: true });
    windowRef.addEventListener('offline', this.refresh, { passive: true });
    this.#displayModeQuery?.addEventListener('change', this.refresh);

    this.#destroyRef.onDestroy(() => {
      windowRef.removeEventListener('online', this.refresh);
      windowRef.removeEventListener('offline', this.refresh);
      this.#displayModeQuery?.removeEventListener('change', this.refresh);
    });
  }

  refresh = (): void => {
    this.#snapshot.set(this.captureSnapshot());
  };

  private captureSnapshot(): DeviceContextSnapshot {
    const windowRef = this.#window.getWindow();
    const navigatorRef = windowRef?.navigator as NavigatorRecord | undefined;
    const userAgent = navigatorRef?.userAgent ?? '';

    return {
      browser: this.resolveBrowser(userAgent),
      device: this.resolveDevice(userAgent),
      displayMode: this.resolveDisplayMode(windowRef, navigatorRef),
      language: navigatorRef?.language ?? 'en-US',
      online: navigatorRef?.onLine ?? true,
      operatingSystem: this.resolveOperatingSystem(userAgent),
      touch: this.resolveTouch(windowRef, navigatorRef, userAgent),
      userAgent,
    };
  }

  private resolveDisplayModeQuery(): MediaQueryList | null {
    const windowRef = this.#window.getWindow();
    if (!windowRef || typeof windowRef.matchMedia !== 'function') {
      return null;
    }

    return windowRef.matchMedia('(display-mode: standalone)');
  }

  private resolveDisplayMode(
    windowRef: Window | null,
    navigatorRef: NavigatorRecord | undefined,
  ): DisplayModeKind {
    if (this.#displayModeQuery?.matches || navigatorRef?.standalone === true) {
      return 'standalone';
    }

    if (windowRef && typeof windowRef.matchMedia === 'function') {
      return windowRef.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
    }

    return 'browser';
  }

  private resolveTouch(
    windowRef: Window | null,
    navigatorRef: NavigatorRecord | undefined,
    userAgent: string,
  ): boolean {
    if ((navigatorRef?.maxTouchPoints ?? 0) > 0) {
      return true;
    }

    if (windowRef && 'ontouchstart' in windowRef) {
      return true;
    }

    return this.resolveDevice(userAgent) !== 'desktop' && this.resolveDevice(userAgent) !== 'unknown';
  }

  private resolveBrowser(userAgent: string): BrowserKind {
    const normalizedUserAgent = userAgent.toLowerCase();

    if (normalizedUserAgent.includes('edg/')) {
      return 'edge';
    }

    if (normalizedUserAgent.includes('opr/') || normalizedUserAgent.includes('opera')) {
      return 'opera';
    }

    if (normalizedUserAgent.includes('firefox/')) {
      return 'firefox';
    }

    if (normalizedUserAgent.includes('chrome/') || normalizedUserAgent.includes('crios/')) {
      return 'chrome';
    }

    if (normalizedUserAgent.includes('safari/')) {
      return 'safari';
    }

    return 'unknown';
  }

  private resolveOperatingSystem(userAgent: string): OperatingSystemKind {
    const normalizedUserAgent = userAgent.toLowerCase();

    if (normalizedUserAgent.includes('android')) {
      return 'android';
    }

    if (
      normalizedUserAgent.includes('iphone') ||
      normalizedUserAgent.includes('ipad') ||
      normalizedUserAgent.includes('ipod')
    ) {
      return 'ios';
    }

    if (normalizedUserAgent.includes('windows')) {
      return 'windows';
    }

    if (normalizedUserAgent.includes('mac os x') || normalizedUserAgent.includes('macintosh')) {
      return 'macos';
    }

    if (normalizedUserAgent.includes('linux')) {
      return 'linux';
    }

    return 'unknown';
  }

  private resolveDevice(userAgent: string): DeviceKind {
    const normalizedUserAgent = userAgent.toLowerCase();

    if (
      normalizedUserAgent.includes('ipad') ||
      normalizedUserAgent.includes('tablet') ||
      normalizedUserAgent.includes('playbook') ||
      normalizedUserAgent.includes('silk')
    ) {
      return 'tablet';
    }

    if (
      normalizedUserAgent.includes('mobile') ||
      normalizedUserAgent.includes('iphone') ||
      normalizedUserAgent.includes('ipod') ||
      normalizedUserAgent.includes('android')
    ) {
      return 'mobile';
    }

    if (normalizedUserAgent.length > 0) {
      return 'desktop';
    }

    return 'unknown';
  }
}
