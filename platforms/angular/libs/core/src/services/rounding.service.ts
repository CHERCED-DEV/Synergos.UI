import { Injectable } from '@angular/core';

export type RoundingMode = 'down' | 'nearest' | 'up';

@Injectable({ providedIn: 'root' })
export class RoundingService {
  round(value: number, step = 0.01, mode: RoundingMode = 'nearest'): number {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
      return value;
    }

    const factor = 1 / step;
    const normalizedValue = value * factor;

    switch (mode) {
      case 'up':
        return Math.ceil(normalizedValue) / factor;
      case 'down':
        return Math.floor(normalizedValue) / factor;
      default:
        return Math.round(normalizedValue) / factor;
    }
  }
}
