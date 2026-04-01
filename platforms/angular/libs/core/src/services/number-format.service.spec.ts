import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NumberFormatService } from './number-format.service';
import { RoundingService } from './rounding.service';

describe(NumberFormatService.name, () => {
  let service: NumberFormatService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        NumberFormatService,
        RoundingService,
        {
          provide: LOCALE_ID,
          useValue: 'en-US',
        },
      ],
    });

    service = TestBed.inject(NumberFormatService);
  });

  it('formats numbers with optional rounding', () => {
    expect(
      service.formatNumber(12.345, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        roundingStep: 0.01,
      }),
    ).toBe('12.35');
  });

  it('formats currency values', () => {
    expect(
      service.formatCurrency(1200, 'USD', {
        maximumFractionDigits: 0,
      }),
    ).toContain('$1,200');
  });

  it('parses sanitized numeric strings', () => {
    expect(service.parse('$1,299.50')).toBe(1299.5);
    expect(service.parse('not-a-number')).toBeNull();
  });
});
