import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DateFormatPipe } from './date-format.pipe';

describe(DateFormatPipe.name, () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCALE_ID, useValue: 'en-US' }],
    });
  });

  it('formats dates using the provided locale', () => {
    const pipe = TestBed.runInInjectionContext(() => new DateFormatPipe());
    expect(pipe.transform('2026-03-31T12:00:00Z', 'MMM d, y', 'UTC')).toBe('Mar 31, 2026');
  });

  it('returns shortened weekday names when requested', () => {
    const pipe = TestBed.runInInjectionContext(() => new DateFormatPipe());
    expect(pipe.transform('2026-03-31T12:00:00Z', 'mediumDate', undefined, 'en-US', false, 2)).toBe(
      'Tu',
    );
  });
});
