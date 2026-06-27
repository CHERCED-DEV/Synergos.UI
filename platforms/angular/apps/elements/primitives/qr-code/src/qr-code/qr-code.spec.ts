import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QrCodeElementComponent } from './qr-code';

describe('QrCodeElementComponent', () => {
  let fixture: ComponentFixture<QrCodeElementComponent>;
  let component: QrCodeElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrCodeElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(QrCodeElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render no matrix without a payload (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasData()).toBe(false);
    expect(component.matrix()).toBeNull();
    expect(component.rects()).toEqual([]);
    expect(component.hasError()).toBe(false);
  });

  it('should encode a payload into a scannable matrix with config (render+config case)', async () => {
    fixture.componentRef.setInput('data', 'https://synergoslabs.co');
    fixture.componentRef.setInput('size', '256');
    fixture.componentRef.setInput('ecLevel', 'h');
    fixture.detectChanges();
    await fixture.whenStable();

    const matrix = component.matrix();
    expect(matrix).not.toBeNull();
    // Version 1+ → odd, finder-pattern aware module count.
    expect(matrix!.size).toBeGreaterThanOrEqual(21);
    expect(matrix!.size % 2).toBe(1);
    expect(matrix!.errorCorrectionLevel).toBe('H');
    expect(component.size()).toBe(256);
    expect(component.rects().length).toBeGreaterThan(0);
    // Quiet zone widens the viewBox beyond the raw matrix.
    expect(component.viewBoxSize()).toBe(matrix!.size + component.margin() * 2);
    // Top-left finder pattern: outer corner module is dark.
    expect(matrix!.modules[0][0]).toBe(true);
  });

  it('should surface an error state when the payload overflows (interaction/error case)', async () => {
    fixture.componentRef.setInput('data', 'x'.repeat(5000));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasData()).toBe(true);
    expect(component.matrix()).toBeNull();
    expect(component.hasError()).toBe(true);
    expect(component.rects()).toEqual([]);
  });

  it('should be idempotent and let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"data":"config-value","size":128}');
    fixture.componentRef.setInput('data', 'input-value');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.data()).toBe('input-value');
    expect(component.size()).toBe(128);

    const first = component.rects();
    // Re-resolving with identical inputs yields an identical module set.
    fixture.detectChanges();
    await fixture.whenStable();
    const second = component.rects();
    expect(second.length).toBe(first.length);
    expect(second.map((r) => r.key)).toEqual(first.map((r) => r.key));
  });
});
