import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  PopoverElementComponent,
  type PopoverToggleDetail,
  normalizePlacement,
} from './popover';

describe('PopoverElementComponent', () => {
  let fixture: ComponentFixture<PopoverElementComponent>;
  let component: PopoverElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PopoverElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PopoverElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create closed with sensible defaults and no panel (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.open()).toBe(false);
    expect(component.triggerLabel()).toBe('Más información');
    expect(component.placement()).toBe('bottom');
    expect(component.hasContent()).toBe(false);
    expect(component.hasHeading()).toBe(false);

    const panel = fixture.nativeElement.querySelector('.popover__panel');
    expect(panel).toBeNull();
  });

  it('should render configured trigger, heading, content and placement (render/config case)', async () => {
    fixture.componentRef.setInput('triggerLabel', '¿Qué incluye?');
    fixture.componentRef.setInput('heading', 'Plan Premium');
    fixture.componentRef.setInput('popoverContent', 'Acceso ilimitado y soporte 24/7.');
    fixture.componentRef.setInput('placement', 'TOP');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.triggerLabel()).toBe('¿Qué incluye?');
    expect(component.heading()).toBe('Plan Premium');
    expect(component.placement()).toBe('top');
    expect(component.hasHeading()).toBe(true);
    expect(component.panelAriaLabelledby()).toBe(component.headingId);
    expect(component.panelAriaLabel()).toBeNull();

    component.openPanel();
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('.popover__heading');
    expect(heading?.textContent).toContain('Plan Premium');
  });

  it('should open, emit toggle, then dismiss on close (interaction case)', async () => {
    fixture.componentRef.setInput('popoverContent', 'Contenido visible.');
    fixture.detectChanges();

    const emitted: PopoverToggleDetail[] = [];
    component.popovertoggle.subscribe((detail) => emitted.push(detail));

    component.toggleOpen();
    fixture.detectChanges();
    expect(component.open()).toBe(true);
    expect(fixture.nativeElement.querySelector('.popover__panel')).not.toBeNull();

    component.close();
    fixture.detectChanges();
    expect(component.open()).toBe(false);
    expect(fixture.nativeElement.querySelector('.popover__panel')).toBeNull();

    expect(emitted).toEqual([{ open: true }, { open: false }]);
  });

  it('should let direct inputs override config and stay stable on re-open (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"placement":"left","triggerLabel":"Config label","closeLabel":"X"}',
    );
    fixture.componentRef.setInput('placement', 'right');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.placement()).toBe('right');
    expect(component.triggerLabel()).toBe('Config label');
    expect(component.closeLabel()).toBe('X');

    // Opening, closing and re-opening is idempotent (no double-open, no leak).
    component.openPanel();
    component.openPanel();
    expect(component.open()).toBe(true);
    component.close();
    component.close();
    expect(component.open()).toBe(false);
  });
});

describe('popover pure helpers', () => {
  it('normalizePlacement accepts the four placements and falls back otherwise', () => {
    expect(normalizePlacement('top')).toBe('top');
    expect(normalizePlacement('LEFT')).toBe('left');
    expect(normalizePlacement('diagonal')).toBe('bottom');
    expect(normalizePlacement(undefined)).toBe('bottom');
  });
});
