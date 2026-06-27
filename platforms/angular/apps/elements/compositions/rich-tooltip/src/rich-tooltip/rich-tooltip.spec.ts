import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RichTooltipElementComponent,
  type RichTooltipToggleDetail,
  normalizePlacement,
} from './rich-tooltip';

describe('RichTooltipElementComponent', () => {
  let fixture: ComponentFixture<RichTooltipElementComponent>;
  let component: RichTooltipElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RichTooltipElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(RichTooltipElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and stay closed with no content (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.open()).toBe(false);
    expect(component.hasContent()).toBe(false);
    expect(component.hasTitle()).toBe(false);
    expect(component.hasBody()).toBe(false);
    expect(component.hasAction()).toBe(false);
    expect(component.placement()).toBe('top');
    expect(component.triggerLabel()).toBe('Más información');
  });

  it('should resolve title, body, action and placement from config (render/config case)', () => {
    fixture.componentRef.setInput('triggerText', '¿Qué es esto?');
    fixture.componentRef.setInput('title', 'Reserva flexible');
    fixture.componentRef.setInput('body', 'Cancela sin costo hasta 24h antes.');
    fixture.componentRef.setInput('actionLabel', 'Ver políticas');
    fixture.componentRef.setInput('actionHref', '/politicas');
    fixture.componentRef.setInput('placement', 'bottom');
    fixture.detectChanges();

    expect(component.triggerText()).toBe('¿Qué es esto?');
    expect(component.hasTitle()).toBe(true);
    expect(component.hasBody()).toBe(true);
    expect(component.hasAction()).toBe(true);
    expect(component.hasContent()).toBe(true);
    expect(component.actionHref()).toBe('/politicas');
    expect(component.placement()).toBe('bottom');
  });

  it('should open on show, emit tooltiptoggle and close on Escape (interaction case)', () => {
    fixture.componentRef.setInput('title', 'Ayuda');
    fixture.detectChanges();

    const emitted: RichTooltipToggleDetail[] = [];
    component.tooltiptoggle.subscribe((detail) => emitted.push(detail));

    component.show();
    expect(component.open()).toBe(true);
    expect(emitted.at(-1)?.open).toBe(true);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.open()).toBe(false);
    expect(emitted.at(-1)?.open).toBe(false);
    expect(emitted.length).toBe(2);
  });

  it('should let direct inputs override config and be idempotent (precedence/idempotent case)', () => {
    fixture.componentRef.setInput('config', '{"title":"Config title","placement":"left"}');
    fixture.componentRef.setInput('title', 'Direct title');
    fixture.detectChanges();

    expect(component.title()).toBe('Direct title');
    expect(component.placement()).toBe('left');

    // Idempotent: showing twice flips state once, emits once.
    const emitted: RichTooltipToggleDetail[] = [];
    component.tooltiptoggle.subscribe((detail) => emitted.push(detail));
    component.show();
    component.show();
    expect(component.open()).toBe(true);
    expect(emitted.length).toBe(1);
  });
});

describe('rich-tooltip pure helpers', () => {
  it('normalizePlacement keeps valid placements and defaults the rest to top', () => {
    expect(normalizePlacement('bottom')).toBe('bottom');
    expect(normalizePlacement('LEFT')).toBe('left');
    expect(normalizePlacement('diagonal')).toBe('top');
    expect(normalizePlacement(undefined)).toBe('top');
    expect(normalizePlacement('')).toBe('top');
  });
});
