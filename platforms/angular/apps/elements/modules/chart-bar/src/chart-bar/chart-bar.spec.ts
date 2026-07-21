import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartBarElementComponent } from './chart-bar';

const DATA = JSON.stringify([
  { label: 'Enero', value: 120 },
  { label: 'Febrero', value: 240 },
  { label: 'Marzo', value: 60 },
]);

describe('ChartBarElementComponent', () => {
  let fixture: ComponentFixture<ChartBarElementComponent>;
  let component: ChartBarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartBarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartBarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no bars (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.bars()).toEqual([]);
    expect(component.hasBars()).toBe(false);
  });

  it('should build proportional bars with formatted values from config (render + config case)', async () => {
    fixture.componentRef.setInput('chartTitle', 'Ventas');
    fixture.componentRef.setInput('dataJson', DATA);
    fixture.componentRef.setInput('valuePrefix', '$');
    fixture.detectChanges();
    await fixture.whenStable();

    const bars = component.bars();
    expect(bars.length).toBe(3);
    expect(component.title()).toBe('Ventas');
    // Tallest datum (240) is the chart max -> 100%; others scale against it.
    expect(bars[1].percent).toBe(100);
    expect(bars[0].percent).toBe(50);
    expect(bars[2].percent).toBe(25);
    expect(bars[1].displayValue).toContain('$');
    expect(bars[1].displayValue).toContain('240');
  });

  it('should track the active bar on interaction (interaction case)', async () => {
    fixture.componentRef.setInput('dataJson', DATA);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isActive(1)).toBe(false);
    component.setActive(1);
    expect(component.isActive(1)).toBe(true);
    expect(component.isActive(0)).toBe(false);

    component.setActive(null);
    expect(component.activeIndex()).toBeNull();
  });

  it('should let direct inputs override config and stay stable across recompute (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config","data":[{"label":"X","value":10}]}');
    fixture.componentRef.setInput('chartTitle', 'Input');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Input');

    const first = component.bars();
    fixture.detectChanges();
    await fixture.whenStable();
    const second = component.bars();

    // Same inputs -> structurally identical bars (deterministic ids + percents).
    expect(second).toEqual(first);
    expect(second[0].percent).toBe(100);
  });
});
