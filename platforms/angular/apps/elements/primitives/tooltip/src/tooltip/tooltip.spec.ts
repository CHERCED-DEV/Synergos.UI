import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  TooltipElementComponent,
  normalizeDelay,
  normalizePosition,
} from './tooltip';

describe('TooltipElementComponent', () => {
  let fixture: ComponentFixture<TooltipElementComponent>;
  let component: TooltipElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TooltipElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TooltipElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing usable without content (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasContent()).toBe(false);
    expect(component.open()).toBe(false);
    expect(component.position()).toBe('top');
    expect(component.delay()).toBe(120);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.tooltip')).toBeNull();
  });

  it('should render trigger + bubble and resolve config (render/config case)', () => {
    fixture.componentRef.setInput('triggerText', 'SLA');
    fixture.componentRef.setInput('tooltipText', 'Acuerdo de nivel de servicio');
    fixture.componentRef.setInput('position', 'right');
    fixture.componentRef.setInput('delay', 0);
    fixture.detectChanges();

    expect(component.hasContent()).toBe(true);
    expect(component.triggerText()).toBe('SLA');
    expect(component.tooltipText()).toBe('Acuerdo de nivel de servicio');
    expect(component.position()).toBe('right');
    expect(component.delay()).toBe(0);

    const root: HTMLElement = fixture.nativeElement;
    const trigger = root.querySelector<HTMLButtonElement>('.tooltip__trigger');
    const bubble = root.querySelector<HTMLElement>('.tooltip__bubble');
    expect(trigger?.textContent?.trim()).toBe('SLA');
    expect(bubble?.getAttribute('role')).toBe('tooltip');
    expect(bubble?.id).toBe(component.bubbleId);
  });

  it('should reveal on show, link aria-describedby, and dismiss on Escape (interaction case)', () => {
    fixture.componentRef.setInput('triggerText', 'SLA');
    fixture.componentRef.setInput('tooltipText', 'Tiempo de respuesta garantizado');
    fixture.componentRef.setInput('delay', 0);
    fixture.detectChanges();

    component.show();
    fixture.detectChanges();
    expect(component.open()).toBe(true);

    const trigger = fixture.nativeElement.querySelector<HTMLButtonElement>('.tooltip__trigger');
    expect(trigger?.getAttribute('aria-describedby')).toBe(component.bubbleId);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.open()).toBe(false);
    expect(trigger?.getAttribute('aria-describedby')).toBeNull();
  });

  it('should let direct inputs override config and be idempotent (precedence case)', () => {
    fixture.componentRef.setInput(
      'config',
      '{"triggerText":"cfg","tooltipText":"desde config","position":"bottom","delay":500}',
    );
    fixture.componentRef.setInput('triggerText', 'override');
    fixture.componentRef.setInput('position', 'left');
    fixture.detectChanges();

    expect(component.triggerText()).toBe('override');
    expect(component.tooltipText()).toBe('desde config');
    expect(component.position()).toBe('left');
    expect(component.delay()).toBe(500);

    // Idempotent: calling hide twice / show twice keeps a single coherent state.
    component.hide();
    component.hide();
    expect(component.open()).toBe(false);
    component.show();
    component.show();
    fixture.detectChanges();
    expect(component.open()).toBe(true);
  });
});

describe('tooltip pure helpers', () => {
  it('normalizeDelay clamps to a non-negative, capped window', () => {
    expect(normalizeDelay(0)).toBe(0);
    expect(normalizeDelay(250)).toBe(250);
    expect(normalizeDelay(-10)).toBe(120);
    expect(normalizeDelay(99999)).toBe(2000);
    expect(normalizeDelay(undefined)).toBe(120);
  });

  it('normalizePosition accepts known sides and rejects the rest', () => {
    expect(normalizePosition('left')).toBe('left');
    expect(normalizePosition('TOP')).toBe('top');
    expect(normalizePosition('diagonal')).toBe('');
    expect(normalizePosition(undefined)).toBe('');
  });
});
