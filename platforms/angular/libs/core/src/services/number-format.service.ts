import { Injectable, LOCALE_ID, inject } from '@angular/core';
import { RoundingService, type RoundingMode } from './rounding.service';

export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  readonly locale?: string;
  readonly roundingMode?: RoundingMode;
  readonly roundingStep?: number;
}

export interface CurrencyFormatOptions
  extends Omit<Intl.NumberFormatOptions, 'currency' | 'style'> {
  readonly locale?: string;
  readonly roundingMode?: RoundingMode;
  readonly roundingStep?: number;
}

@Injectable({ providedIn: 'root' })
export class NumberFormatService {
  readonly #locale = inject(LOCALE_ID);
  readonly #rounding = inject(RoundingService);

  formatNumber(value: number, options: NumberFormatOptions = {}): string {
    const roundedValue = this.resolveRoundedValue(value, options.roundingStep, options.roundingMode);
    const locale = options.locale ?? this.#locale;
    const formatOptions = this.#omitFormattingMeta(options);

    return new Intl.NumberFormat(locale, formatOptions).format(roundedValue);
  }

  formatCurrency(
    value: number,
    currency: string,
    options: CurrencyFormatOptions = {},
  ): string {
    return this.formatNumber(value, {
      ...options,
      currency,
      style: 'currency',
    });
  }

  parse(value: string): number | null {
    const sanitizedValue = value.replace(/[^\d,.-]/g, '');
    if (!sanitizedValue || sanitizedValue === '-' || sanitizedValue === '.' || sanitizedValue === ',') {
      return null;
    }

    const lastDotIndex = sanitizedValue.lastIndexOf('.');
    const lastCommaIndex = sanitizedValue.lastIndexOf(',');
    const decimalIndex = Math.max(lastDotIndex, lastCommaIndex);

    const normalizedValue =
      decimalIndex >= 0
        ? [
            sanitizedValue.slice(0, decimalIndex).replace(/[.,]/g, ''),
            sanitizedValue.slice(decimalIndex + 1).replace(/[.,]/g, ''),
          ].join('.')
        : sanitizedValue.replace(/[.,]/g, '');

    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private resolveRoundedValue(
    value: number,
    step: number | undefined,
    mode: RoundingMode | undefined,
  ): number {
    if (step === undefined) {
      return value;
    }

    return this.#rounding.round(value, step, mode ?? 'nearest');
  }

  #omitFormattingMeta(
    options: NumberFormatOptions | CurrencyFormatOptions,
  ): Intl.NumberFormatOptions {
    const { locale, roundingMode, roundingStep, ...formatOptions } = options;
    void locale;
    void roundingMode;
    void roundingStep;
    return formatOptions;
  }
}
