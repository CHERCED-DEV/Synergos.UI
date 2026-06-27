import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RangeSliderElementComponent,
  type RangeChangeDetail,
  snapToStep,
} from './range-slider';

describe('RangeSliderElementComponent', () => {
  let fixture: ComponentFixture<RangeSliderElementComponent>;
  let component: RangeSliderElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RangeSliderElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(RangeSliderElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with sensible defaults and no config (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.min()).toBe(0);
    expect(component.max()).toBe(100);
    expect(component.step()).toBe(1);
    expect(component.isRange()).toBe(true);
    // Default bounds span the whole domain.
    expect(component.low()).toBe(0);
    expect(component.high()).toBe(100);
    expect(component.fillStart()).toBe(0);
    expect(component.fillEnd()).toBe(100);
  });

  it('should resolve config + initialValue and snap to step (render/config case)', async () => {
    fixture.componentRef.setInput('label', 'Precio');
    fixture.componentRef.setInput('minValue', '0');
    fixture.componentRef.setInput('maxValue', '1000');
    fixture.componentRef.setInput('step', '50');
    fixture.componentRef.setInput('prefix', '$');
    fixture.componentRef.setInput('initialValue', '170,840');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Precio');
    expect(component.max()).toBe(1000);
    expect(component.step()).toBe(50);
    // 170 snaps to 150, 840 snaps to 850.
    expect(component.low()).toBe(150);
    expect(component.high()).toBe(850);
    expect(component.displayValue()).toBe('$150 – $850');
    expect(component.lowPercent()).toBeCloseTo(15, 5);
    expect(component.highPercent()).toBeCloseTo(85, 5);
  });

  it('should move a thumb and emit rangechange, keeping low <= high (interaction case)', async () => {
    fixture.componentRef.setInput('minValue', '0');
    fixture.componentRef.setInput('maxValue', '100');
    fixture.componentRef.setInput('step', '10');
    fixture.componentRef.setInput('initialValue', '20,80');
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: RangeChangeDetail | undefined;
    component.rangechange.subscribe((detail) => (emitted = detail));

    component.onThumbInput('high', 50);
    expect(component.high()).toBe(50);
    expect(emitted).toEqual({ low: 20, high: 50 });

    // Driving low past high clamps it to high (no crossover).
    component.onThumbInput('low', 90);
    expect(component.low()).toBe(50);
    expect(component.high()).toBe(50);
    expect(emitted).toEqual({ low: 50, high: 50 });
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"max":200,"step":5,"range":false}');
    fixture.componentRef.setInput('maxValue', '500');
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config.
    expect(component.max()).toBe(500);
    // config-only value still applies.
    expect(component.step()).toBe(5);
    expect(component.isRange()).toBe(false);

    // Re-applying the same inputs is stable (idempotent).
    fixture.componentRef.setInput('maxValue', '500');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.max()).toBe(500);
  });

  it('should drive the high thumb only in single mode', async () => {
    fixture.componentRef.setInput('range', 'false');
    fixture.componentRef.setInput('initialValue', '40');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isRange()).toBe(false);
    expect(component.high()).toBe(40);
    // Single mode fills from the start.
    expect(component.fillStart()).toBe(0);
    expect(component.displayValue()).toBe('40');
  });

  it('should handle keyboard steps with clamping at bounds', async () => {
    fixture.componentRef.setInput('minValue', '0');
    fixture.componentRef.setInput('maxValue', '10');
    fixture.componentRef.setInput('step', '1');
    fixture.componentRef.setInput('initialValue', '2,9');
    fixture.detectChanges();
    await fixture.whenStable();

    const preventDefault = (): void => undefined;
    component.onThumbKeydown({ key: 'ArrowRight', preventDefault } as KeyboardEvent, 'high');
    expect(component.high()).toBe(10);

    // End clamps to max; further presses do not exceed it.
    component.onThumbKeydown({ key: 'End', preventDefault } as KeyboardEvent, 'high');
    expect(component.high()).toBe(10);

    component.onThumbKeydown({ key: 'Home', preventDefault } as KeyboardEvent, 'low');
    expect(component.low()).toBe(0);
  });
});

describe('range-slider pure helpers', () => {
  it('snapToStep rounds to the nearest step and clamps to range', () => {
    expect(snapToStep(170, 0, 1000, 50)).toBe(150);
    expect(snapToStep(840, 0, 1000, 50)).toBe(850);
    expect(snapToStep(-20, 0, 100, 10)).toBe(0);
    expect(snapToStep(999, 0, 100, 10)).toBe(100);
  });

  it('snapToStep falls back to min for non-finite input', () => {
    expect(snapToStep(Number.NaN, 5, 100, 10)).toBe(5);
  });
});
