import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ColorPickerElementComponent,
  type ColorPickerChangeDetail,
  isLightColor,
  normalizeHex,
  normalizePalette,
} from './color-picker';

const PALETTE = JSON.stringify(['#abc', '#FF0000', '#ff0000', 'no-color', '#00ff00']);

describe('ColorPickerElementComponent', () => {
  let fixture: ComponentFixture<ColorPickerElementComponent>;
  let component: ColorPickerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorPickerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorPickerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with the canonical defaults and no config (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.label()).toBe('Color');
    expect(component.selected()).toBe('#4f6ef7');
    // Falls back to the canonical brand palette when none is supplied.
    expect(component.palette().length).toBeGreaterThan(0);
    expect(component.isSelected('#4f6ef7')).toBe(true);
  });

  it('should render label + initial color + normalized palette from config (render/config case)', async () => {
    fixture.componentRef.setInput('label', 'Acento');
    fixture.componentRef.setInput('initialColor', '#3854D8');
    fixture.componentRef.setInput('paletteJson', PALETTE);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Acento');
    expect(component.selected()).toBe('#3854d8');
    // 3 valid, deduped colors survive (#aabbcc expanded, #ff0000 once, #00ff00).
    const hexes = component.palette().map((swatch) => swatch.hex);
    expect(hexes).toEqual(['#aabbcc', '#ff0000', '#00ff00']);
  });

  it('should commit a swatch and emit colorchange with the normalized color (interaction case)', () => {
    let emitted: ColorPickerChangeDetail | undefined;
    component.colorchange.subscribe((detail) => (emitted = detail));

    component.selectSwatch('#22C55E');

    expect(component.selected()).toBe('#22c55e');
    expect(component.isSelected('#22c55e')).toBe(true);
    expect(emitted?.color).toBe('#22c55e');
  });

  it('should not re-emit when re-committing the active color (idempotent case)', () => {
    let count = 0;
    component.colorchange.subscribe(() => count++);

    component.selectSwatch('#8b5cf6');
    component.selectSwatch('#8b5cf6');
    component.selectSwatch('#8B5CF6');

    expect(component.selected()).toBe('#8b5cf6');
    expect(count).toBe(1);
  });

  it('should commit a valid hex draft and snap back an invalid one', () => {
    component.onDraftInput('#0ea5e9');
    expect(component.isDraftValid()).toBe(true);
    component.commitDraft();
    expect(component.selected()).toBe('#0ea5e9');

    component.onDraftInput('zzz');
    expect(component.isDraftValid()).toBe(false);
    component.commitDraft();
    // Field snaps back to the last committed value; selection unchanged.
    expect(component.draft()).toBe('#0ea5e9');
    expect(component.selected()).toBe('#0ea5e9');
  });

  it('should let direct inputs override config (precedence)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Desde config","initialColor":"#000000"}');
    fixture.componentRef.setInput('label', 'Directo');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Directo');
    expect(component.selected()).toBe('#000000');
  });
});

describe('color-picker pure helpers', () => {
  it('normalizeHex expands shorthand and rejects invalid input', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('4f6ef7')).toBe('#4f6ef7');
    expect(normalizeHex('rebeccapurple')).toBe('');
    expect(normalizeHex(undefined)).toBe('');
  });

  it('normalizePalette dedupes and drops invalid entries', () => {
    expect(normalizePalette(['#fff', '#ffffff', 'bad', '#000'])).toEqual(['#ffffff', '#000000']);
    expect(normalizePalette('not-array')).toEqual([]);
  });

  it('isLightColor distinguishes light from dark', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#0f172a')).toBe(false);
  });
});
