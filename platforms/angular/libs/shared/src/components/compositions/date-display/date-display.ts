import { LOCALE_ID, ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type DateDisplayLayout = 'inline' | 'stacked';

@Component({
  selector: 'syn-date-display',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dateValue(); as value) {
      <time class="syn-date-display" [class]="displayClass()" [attr.datetime]="isoValue()">
        @if (weekday()) {
          <span class="syn-date-display__weekday">{{ weekday() }}</span>
        }

        <span class="syn-date-display__month">{{ month() }}</span>
        <span class="syn-date-display__day">{{ day() }}</span>
        <span class="syn-date-display__year">{{ year() }}</span>
      </time>
    }
  `,
  styleUrl: './date-display.scss',
})
export class DateDisplayComponent {
  readonly #locale = inject(LOCALE_ID);

  readonly value = input<string | number | Date | null>(null);
  readonly locale = input('');
  readonly layout = input<DateDisplayLayout>('inline');
  readonly showWeekday = input(false);
  readonly weekdayLength = input(3);

  readonly dateValue = computed(() => {
    const currentValue = this.value();
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      return null;
    }

    const parsedDate = new Date(currentValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  });

  readonly displayClass = computed(() =>
    classNames('syn-date-display', `syn-date-display--${this.layout()}`),
  );

  readonly isoValue = computed(() => this.dateValue()?.toISOString() ?? null);
  readonly weekday = computed(() => {
    const value = this.dateValue();
    if (!this.showWeekday() || !value) {
      return '';
    }

    const formatter = new Intl.DateTimeFormat(this.locale() || this.#locale, {
      weekday: 'short',
      timeZone: 'UTC',
    });
    return formatter.format(value).slice(0, this.weekdayLength());
  });
  readonly month = computed(() => {
    const value = this.dateValue();
    if (!value) {
      return '';
    }

    return new Intl.DateTimeFormat(this.locale() || this.#locale, {
      month: 'short',
      timeZone: 'UTC',
    }).format(value);
  });
  readonly day = computed(() => {
    const value = this.dateValue();
    if (!value) {
      return '';
    }

    return new Intl.DateTimeFormat(this.locale() || this.#locale, {
      day: '2-digit',
      timeZone: 'UTC',
    }).format(value);
  });
  readonly year = computed(() => {
    const value = this.dateValue();
    if (!value) {
      return '';
    }

    return new Intl.DateTimeFormat(this.locale() || this.#locale, {
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value);
  });
}
