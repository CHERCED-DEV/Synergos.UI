import { formatDate } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

@Pipe({
  name: 'synDateFormat',
  standalone: true,
})
export class DateFormatPipe implements PipeTransform {
  readonly #locale = inject(LOCALE_ID);

  transform(
    value: string | number | Date | null | undefined,
    format = 'mediumDate',
    timezone?: string,
    locale?: string,
    trimTrailingPeriod = false,
    weekdayLength?: number,
  ): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    if (typeof weekdayLength === 'number') {
      const weekday = new Intl.DateTimeFormat(locale ?? this.#locale, { weekday: 'short' }).format(
        new Date(value),
      );
      return weekday.slice(0, weekdayLength);
    }

    const formatted = formatDate(value, format, locale ?? this.#locale, timezone);
    return trimTrailingPeriod ? formatted.replace(/\.$/, '') : formatted;
  }
}
