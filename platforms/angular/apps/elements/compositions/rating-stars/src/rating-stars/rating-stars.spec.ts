import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RatingStarsElementComponent,
  buildStars,
  clampNumber,
  readNumber,
  roundToHalf,
} from './rating-stars';

describe('RatingStarsElementComponent', () => {
  let fixture: ComponentFixture<RatingStarsElementComponent>;
  let component: RatingStarsElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RatingStarsElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(RatingStarsElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with sane defaults and no value (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.max()).toBe(5);
    expect(component.readonly()).toBe(false);
    expect(component.configuredValue()).toBe(0);
    expect(component.stars().length).toBe(5);
    expect(component.stars().every((star) => star.fill === 0)).toBe(true);
  });

  it('should render a readonly half-star rating from config (render/config case)', async () => {
    fixture.componentRef.setInput('config', {
      value: 3.5,
      max: 5,
      readonly: true,
      allowHalf: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.readonly()).toBe(true);
    expect(component.currentValue()).toBe(3.5);
    const fills = component.stars().map((star) => star.fill);
    expect(fills).toEqual([1, 1, 1, 0.5, 0]);
    expect(component.ariaLabel()).toContain('3.5 de 5 estrellas');
  });

  it('should pick a value and emit ratingchange on interaction (interaction case)', async () => {
    let emitted: number | undefined;
    component.ratingchange.subscribe((value) => (emitted = value));

    component.pick(4);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toBe(4);
    expect(component.selectedPosition()).toBe(4);
    expect(component.isChecked(4)).toBe(true);
    expect(component.stars().filter((star) => star.fill >= 1).length).toBe(4);
  });

  it('should let direct inputs override config and stay idempotent (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', { value: 2, max: 5, readonly: true });
    fixture.componentRef.setInput('value', '5');
    fixture.componentRef.setInput('readonly', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.configuredValue()).toBe(5);

    // Re-applying the same inputs yields the same resolved state.
    fixture.componentRef.setInput('value', '5');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.configuredValue()).toBe(5);
    expect(component.currentValue()).toBe(5);
  });

  it('should ignore interaction while readonly', async () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.componentRef.setInput('value', 2);
    fixture.detectChanges();
    await fixture.whenStable();

    component.pick(5);
    expect(component.pickedValue()).toBeNull();
    expect(component.currentValue()).toBe(2);
  });

  it('should clamp configured value to max', async () => {
    fixture.componentRef.setInput('max', '3');
    fixture.componentRef.setInput('value', '9');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.max()).toBe(3);
    expect(component.configuredValue()).toBe(3);
  });
});

describe('rating-stars pure helpers', () => {
  it('clampNumber bounds and guards non-finite values', () => {
    expect(clampNumber(10, 0, 5)).toBe(5);
    expect(clampNumber(-2, 0, 5)).toBe(0);
    expect(clampNumber(Number.NaN, 0, 5)).toBe(0);
  });

  it('readNumber parses numbers and numeric strings, rejects junk', () => {
    expect(readNumber(4)).toBe(4);
    expect(readNumber('3,5')).toBe(3.5);
    expect(readNumber('basura')).toBeNull();
  });

  it('roundToHalf snaps to nearest 0.5', () => {
    expect(roundToHalf(3.2)).toBe(3);
    expect(roundToHalf(3.3)).toBe(3.5);
    expect(roundToHalf(3.8)).toBe(4);
  });

  it('buildStars produces whole-star fills when half is disabled', () => {
    const stars = buildStars(3.5, 5, false);
    expect(stars.map((star) => star.fill)).toEqual([1, 1, 1, 1, 0]);
  });

  it('buildStars produces a half fill when half is enabled', () => {
    const stars = buildStars(2.5, 4, true);
    expect(stars.map((star) => star.fill)).toEqual([1, 1, 0.5, 0]);
  });
});
