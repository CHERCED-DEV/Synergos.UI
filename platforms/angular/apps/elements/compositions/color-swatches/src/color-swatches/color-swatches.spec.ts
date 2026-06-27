import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ColorSwatchesElementComponent,
  type ColorSwatchSelectDetail,
  clampColumns,
  normalizeColor,
  normalizeShape,
  normalizeSwatches,
} from './color-swatches';

const SWATCHES = JSON.stringify([
  { value: 'rojo', label: 'Rojo', color: '#e23b3b' },
  { value: 'azul', label: 'Azul', color: '#3b6ee2' },
  { value: 'rojo', label: 'Duplicado — descartado', color: '#000000' },
  { value: 'verde', label: 'Verde', color: '#2fb872', disabled: true },
  { value: 'roto', label: 'Sin color válido', color: 'no-es-color !!' },
  '#ffcc00',
]);

describe('ColorSwatchesElementComponent', () => {
  let fixture: ComponentFixture<ColorSwatchesElementComponent>;
  let component: ColorSwatchesElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorSwatchesElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorSwatchesElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render an empty palette with no swatches (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasSwatches()).toBe(false);
    expect(component.swatches().length).toBe(0);
    expect(component.selectedValue()).toBeNull();
    expect(component.shape()).toBe('circle');
    expect(component.columns()).toBe(6);
  });

  it('should normalize swatches and honor heading/shape/columns config (render/config case)', async () => {
    fixture.componentRef.setInput('heading', 'Elige un color');
    fixture.componentRef.setInput('shape', 'square');
    fixture.componentRef.setInput('columns', '4');
    fixture.componentRef.setInput('swatches', SWATCHES);
    fixture.detectChanges();
    await fixture.whenStable();

    // rojo, azul, verde(disabled), #ffcc00 survive; duplicate rojo and the
    // invalid-color entry are dropped.
    expect(component.swatches().length).toBe(4);
    expect(component.hasSwatches()).toBe(true);
    expect(component.hasHeading()).toBe(true);
    expect(component.heading()).toBe('Elige un color');
    expect(component.shape()).toBe('square');
    expect(component.columns()).toBe(4);

    const verde = component.swatches().find((swatch) => swatch.value === 'verde');
    expect(verde?.disabled).toBe(true);
  });

  it('should select a swatch and emit swatchselect with its detail (interaction case)', async () => {
    fixture.componentRef.setInput('swatches', SWATCHES);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: ColorSwatchSelectDetail | undefined;
    component.swatchselect.subscribe((detail) => (emitted = detail));

    const azul = component.swatches().find((swatch) => swatch.value === 'azul');
    expect(azul).toBeDefined();
    component.selectSwatch(azul!);

    expect(component.selectedValue()).toBe('azul');
    expect(component.isSelected(azul!)).toBe(true);
    expect(emitted?.value).toBe('azul');
    expect(emitted?.color).toBe('#3b6ee2');

    // Disabled swatches never become selected.
    const verde = component.swatches().find((swatch) => swatch.value === 'verde');
    component.selectSwatch(verde!);
    expect(component.selectedValue()).toBe('azul');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"shape":"square","columns":3}');
    fixture.componentRef.setInput('shape', 'pill');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.shape()).toBe('pill');
    expect(component.columns()).toBe(3);

    // Re-applying the same inputs yields the same resolved state (idempotent).
    fixture.componentRef.setInput('shape', 'pill');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.shape()).toBe('pill');
  });
});

describe('color-swatches pure helpers', () => {
  it('normalizeColor keeps valid CSS colors and drops junk', () => {
    expect(normalizeColor('#fff')).toBe('#fff');
    expect(normalizeColor('#3b6ee2')).toBe('#3b6ee2');
    expect(normalizeColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
    expect(normalizeColor('var(--syn-color-brand-500)')).toBe('var(--syn-color-brand-500)');
    expect(normalizeColor('basura !!')).toBe('');
    expect(normalizeColor(undefined)).toBe('');
  });

  it('normalizeShape falls back to the default circle shape', () => {
    expect(normalizeShape('square')).toBe('square');
    expect(normalizeShape('PILL')).toBe('pill');
    expect(normalizeShape('hexagon')).toBe('circle');
    expect(normalizeShape(undefined)).toBe('circle');
  });

  it('clampColumns keeps values within 1..12', () => {
    expect(clampColumns(4)).toBe(4);
    expect(clampColumns(0)).toBe(1);
    expect(clampColumns(99)).toBe(12);
    expect(clampColumns(undefined)).toBe(6);
  });

  it('normalizeSwatches dedupes by value and drops invalid entries', () => {
    const swatches = normalizeSwatches([
      { value: 'a', label: 'A', color: '#aaa' },
      { value: 'a', label: 'Dup', color: '#bbb' },
      { value: 'b', color: 'no-color !!' },
      '#cccccc',
    ]);
    expect(swatches.length).toBe(2);
    expect(swatches[0].value).toBe('a');
    expect(swatches[1].color).toBe('#cccccc');
  });
});
