import { Injectable, inject } from '@angular/core';
import {
  DeviceContextService,
  type BrowserKind,
  type DeviceContextSnapshot,
  type DeviceKind,
  type DisplayModeKind,
  type OperatingSystemKind,
} from './device-context.service';

export interface CompatibilityRule<T extends string> {
  readonly allowed?: readonly T[];
  readonly blocked?: readonly T[];
}

export interface DeviceCompatibilityConfig {
  readonly browsers?: CompatibilityRule<BrowserKind>;
  readonly devices?: CompatibilityRule<DeviceKind>;
  readonly displayModes?: CompatibilityRule<DisplayModeKind>;
  readonly operatingSystems?: CompatibilityRule<OperatingSystemKind>;
  readonly requireTouch?: boolean;
}

export interface DeviceCompatibilityResult {
  readonly compatible: boolean;
  readonly reasons: readonly string[];
  readonly snapshot: DeviceContextSnapshot;
}

@Injectable({ providedIn: 'root' })
export class DeviceCompatibilityService {
  readonly #deviceContext = inject(DeviceContextService);

  isCompatible(
    config: DeviceCompatibilityConfig,
    snapshot: DeviceContextSnapshot = this.#deviceContext.snapshot(),
  ): boolean {
    return this.evaluate(config, snapshot).compatible;
  }

  evaluate(
    config: DeviceCompatibilityConfig,
    snapshot: DeviceContextSnapshot = this.#deviceContext.snapshot(),
  ): DeviceCompatibilityResult {
    const reasons: string[] = [];

    this.evaluateRule('browser', snapshot.browser, config.browsers, reasons);
    this.evaluateRule('device', snapshot.device, config.devices, reasons);
    this.evaluateRule('display mode', snapshot.displayMode, config.displayModes, reasons);
    this.evaluateRule('operating system', snapshot.operatingSystem, config.operatingSystems, reasons);

    if (config.requireTouch && !snapshot.touch) {
      reasons.push('Touch input is required.');
    }

    return {
      compatible: reasons.length === 0,
      reasons,
      snapshot,
    };
  }

  private evaluateRule<T extends string>(
    label: string,
    value: T,
    rule: CompatibilityRule<T> | undefined,
    reasons: string[],
  ): void {
    if (!rule) {
      return;
    }

    if (rule.allowed && rule.allowed.length > 0 && !rule.allowed.includes(value)) {
      reasons.push(`The current ${label} is not in the allowed list.`);
    }

    if (rule.blocked && rule.blocked.includes(value)) {
      reasons.push(`The current ${label} is blocked.`);
    }
  }
}
