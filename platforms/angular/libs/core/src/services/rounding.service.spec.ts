import { TestBed } from '@angular/core/testing';
import { RoundingService } from './rounding.service';

describe(RoundingService.name, () => {
  let service: RoundingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RoundingService],
    });

    service = TestBed.inject(RoundingService);
  });

  it('rounds to the nearest step by default', () => {
    expect(service.round(12.345, 0.01)).toBe(12.35);
    expect(service.round(127, 10)).toBe(130);
  });

  it('supports upward and downward strategies', () => {
    expect(service.round(12.341, 0.01, 'up')).toBe(12.35);
    expect(service.round(12.349, 0.01, 'down')).toBe(12.34);
  });
});
