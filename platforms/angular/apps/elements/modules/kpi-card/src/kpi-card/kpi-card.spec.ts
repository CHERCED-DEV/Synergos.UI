import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KpiCardElementComponent } from './kpi-card';

const SPARKLINE = JSON.stringify([10, 12, 9, 15, 14, 18, 22]);

describe('KpiCardElementComponent', () => {
  let fixture: ComponentFixture<KpiCardElementComponent>;
  let component: KpiCardElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiCardElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiCardElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no value, no delta and no sparkline (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasValue()).toBe(false);
    expect(component.hasDelta()).toBe(false);
    expect(component.hasSparkline()).toBe(false);
    expect(component.trend()).toBe('flat');
  });

  it('should render value, derive trend + delta label and build a sparkline (happy case)', async () => {
    fixture.componentRef.setInput('label', 'Ingresos');
    fixture.componentRef.setInput('value', '$1.2M');
    fixture.componentRef.setInput('delta', 12.5);
    fixture.componentRef.setInput('period', 'vs mes anterior');
    fixture.componentRef.setInput('sparkline', SPARKLINE);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.value()).toBe('$1.2M');
    expect(component.trend()).toBe('up');
    expect(component.deltaLabel()).toBe('+12.5%');
    expect(component.hasSparkline()).toBe(true);
    const spark = component.sparkline();
    expect(spark?.points.split(' ').length).toBe(7);
    expect(component.trendDescription()).toContain('al alza');
  });

  it('should resolve a negative delta to a down trend (filter/branch case)', async () => {
    fixture.componentRef.setInput('value', '320');
    fixture.componentRef.setInput('delta', -4);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.trend()).toBe('down');
    expect(component.deltaLabel()).toBe('-4%');

    // A series with fewer than two points yields no sparkline.
    fixture.componentRef.setInput('sparkline', JSON.stringify([5]));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.hasSparkline()).toBe(false);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"value":"Config value","trend":"down","delta":-9}',
    );
    fixture.componentRef.setInput('value', 'Input value');
    fixture.componentRef.setInput('trend', 'up');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.value()).toBe('Input value');
    expect(component.trend()).toBe('up');

    // Re-applying the same inputs is idempotent.
    fixture.componentRef.setInput('value', 'Input value');
    fixture.componentRef.setInput('trend', 'up');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.value()).toBe('Input value');
    expect(component.trend()).toBe('up');
  });
});
