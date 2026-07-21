import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SplitterElementComponent,
  type SplitterChangeDetail,
  clampSplit,
  normalizeOrientation,
} from './splitter';

describe('SplitterElementComponent', () => {
  let fixture: ComponentFixture<SplitterElementComponent>;
  let component: SplitterElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplitterElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SplitterElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with sane defaults and no content (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.orientation()).toBe('horizontal');
    expect(component.split()).toBe(50);
    expect(component.minSplit()).toBe(10);
    expect(component.maxSplit()).toBe(90);
    expect(component.trailingSplit()).toBe(50);
    expect(component.leftContent()).toBe('');
    expect(component.rightContent()).toBe('');
  });

  it('should render config: orientation, content, labels and initial split (render/config case)', async () => {
    fixture.componentRef.setInput('orientation', 'vertical');
    fixture.componentRef.setInput('leftContent', 'Arriba');
    fixture.componentRef.setInput('rightContent', 'Abajo');
    fixture.componentRef.setInput('initialSplit', 30);
    fixture.componentRef.setInput('minSplit', 20);
    fixture.componentRef.setInput('maxSplit', 80);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.orientation()).toBe('vertical');
    expect(component.leftContent()).toBe('Arriba');
    expect(component.rightContent()).toBe('Abajo');
    expect(component.split()).toBe(30);
    expect(component.trailingSplit()).toBe(70);

    const host: HTMLElement = fixture.nativeElement;
    const separator = host.querySelector('.splitter__separator');
    expect(separator?.getAttribute('role')).toBe('separator');
    expect(separator?.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator?.getAttribute('aria-valuenow')).toBe('30');
    expect(separator?.getAttribute('aria-valuemin')).toBe('20');
    expect(separator?.getAttribute('aria-valuemax')).toBe('80');
  });

  it('should resize via keyboard and emit splitchange, clamped to bounds (interaction case)', async () => {
    fixture.componentRef.setInput('initialSplit', 50);
    fixture.componentRef.setInput('minSplit', 20);
    fixture.componentRef.setInput('maxSplit', 80);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: SplitterChangeDetail[] = [];
    component.splitchange.subscribe((detail) => emitted.push(detail));

    // ArrowRight increases the leading region (horizontal default).
    component.onSeparatorKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.split()).toBe(52);
    expect(emitted.at(-1)).toEqual({ split: 52, orientation: 'horizontal' });

    // Home jumps to the minimum bound.
    component.onSeparatorKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(component.split()).toBe(20);

    // End jumps to the maximum; PageDown beyond it stays clamped.
    component.onSeparatorKeydown(new KeyboardEvent('keydown', { key: 'End' }));
    expect(component.split()).toBe(80);
    component.onSeparatorKeydown(new KeyboardEvent('keydown', { key: 'PageDown' }));
    expect(component.split()).toBe(80);
    expect(emitted.at(-1)?.split).toBe(80);
  });

  it('should let direct inputs override config, and setting the same value is idempotent (precedence/idempotent case)', async () => {
    fixture.componentRef.setInput('config', '{"orientation":"vertical","initialSplit":70}');
    fixture.componentRef.setInput('orientation', 'horizontal');
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config.
    expect(component.orientation()).toBe('horizontal');
    // initialSplit only in config still applies.
    expect(component.split()).toBe(70);

    const emitted: SplitterChangeDetail[] = [];
    component.splitchange.subscribe((detail) => emitted.push(detail));

    component.setSplit(40);
    expect(component.split()).toBe(40);
    expect(emitted.length).toBe(1);

    // Re-applying the same value is a no-op: no duplicate emission.
    component.setSplit(40);
    expect(component.split()).toBe(40);
    expect(emitted.length).toBe(1);
  });
});

describe('splitter pure helpers', () => {
  it('clampSplit keeps values inside the band', () => {
    expect(clampSplit(50, 10, 90)).toBe(50);
    expect(clampSplit(-5, 10, 90)).toBe(10);
    expect(clampSplit(120, 10, 90)).toBe(90);
    expect(clampSplit(Number.NaN, 10, 90)).toBe(10);
  });

  it('normalizeOrientation defaults to horizontal', () => {
    expect(normalizeOrientation('vertical')).toBe('vertical');
    expect(normalizeOrientation('VERTICAL')).toBe('vertical');
    expect(normalizeOrientation('horizontal')).toBe('horizontal');
    expect(normalizeOrientation(undefined)).toBe('horizontal');
    expect(normalizeOrientation('basura')).toBe('horizontal');
  });
});
