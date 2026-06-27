import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  TestimonialCarouselElementComponent,
  type TestimonialSlideChangeDetail,
  normalizeTestimonials,
} from './testimonial-carousel';

const TESTIMONIALS = JSON.stringify([
  { quote: 'Synergos cambió nuestro flujo.', author: 'Ana Pérez', role: 'CTO', rating: 5 },
  { quote: 'Implementación impecable.', author: 'Luis Gómez', role: 'Fundador' },
  { text: 'Soporte de primera.', name: 'María Ruiz' },
  { quote: 'Sin autor — descartado' },
  { author: 'Sin cita — descartado' },
]);

describe('TestimonialCarouselElementComponent', () => {
  let fixture: ComponentFixture<TestimonialCarouselElementComponent>;
  let component: TestimonialCarouselElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestimonialCarouselElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestimonialCarouselElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing rotatable with no testimonials (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasTestimonials()).toBe(false);
    expect(component.hasMultiple()).toBe(false);
    expect(component.count()).toBe(0);
    expect(component.activeTestimonial()).toBeNull();
  });

  it('should normalize testimonials and resolve config from inputs (render/config case)', async () => {
    fixture.componentRef.setInput('testimonials', TESTIMONIALS);
    fixture.componentRef.setInput('autoplayInterval', '500');
    fixture.componentRef.setInput('ariaLabel', 'Lo que dicen');
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid testimonials survive (missing author/quote dropped).
    expect(component.count()).toBe(3);
    expect(component.hasMultiple()).toBe(true);
    expect(component.ariaLabel()).toBe('Lo que dicen');
    // Interval clamped to the safe floor (1500ms) even when a smaller value is set.
    expect(component.autoplayInterval()).toBe(1500);

    const first = component.testimonials()[0];
    expect(first.author).toBe('Ana Pérez');
    expect(first.initials).toBe('AP');
    expect(component.starStates(first.rating).filter(Boolean).length).toBe(5);
  });

  it('should advance, loop, jump via dots and emit slidechange (interaction case)', async () => {
    fixture.componentRef.setInput('testimonials', TESTIMONIALS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: TestimonialSlideChangeDetail | undefined;
    component.slidechange.subscribe((detail) => (emitted = detail));

    expect(component.activeIndex()).toBe(0);

    component.next();
    expect(component.activeIndex()).toBe(1);
    expect(emitted?.index).toBe(1);
    expect(component.isActive(1)).toBe(true);

    // goTo a specific slide.
    component.goTo(2);
    expect(component.activeIndex()).toBe(2);
    expect(emitted?.testimonial.author).toBe('María Ruiz');

    // Loop wraps forward past the end back to 0 (loop defaults to true).
    component.next();
    expect(component.activeIndex()).toBe(0);

    // Pause/resume toggles autoplay running state.
    fixture.componentRef.setInput('autoplay', true);
    fixture.detectChanges();
    component.pause();
    expect(component.isPaused()).toBe(true);
    component.resume();
    expect(component.isPaused()).toBe(false);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"ariaLabel":"desde config","loop":false}');
    fixture.componentRef.setInput('ariaLabel', 'desde atributo');
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config.
    expect(component.ariaLabel()).toBe('desde atributo');
    // Config still supplies values not overridden by attributes.
    expect(component.loop()).toBe(false);

    // Re-applying the same inputs yields the same resolved state (idempotent).
    fixture.componentRef.setInput('ariaLabel', 'desde atributo');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.ariaLabel()).toBe('desde atributo');
    expect(component.loop()).toBe(false);
  });
});

describe('testimonial-carousel pure helpers', () => {
  it('normalizeTestimonials drops entries without quote or author and derives initials', () => {
    const result = normalizeTestimonials([
      { quote: 'Ok', author: 'Juan Diaz', rating: 9 },
      { quote: 'Sin autor' },
      { author: 'Sin cita' },
      'no-objeto',
    ]);

    expect(result.length).toBe(1);
    expect(result[0].author).toBe('Juan Diaz');
    expect(result[0].initials).toBe('JD');
    // Rating clamped to the 0..5 range.
    expect(result[0].rating).toBe(5);
  });
});
