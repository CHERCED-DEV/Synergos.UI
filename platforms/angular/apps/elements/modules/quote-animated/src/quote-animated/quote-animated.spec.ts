import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  QuoteAnimatedElementComponent,
  type QuoteChangeDetail,
  normalizeQuotes,
} from './quote-animated';

const QUOTES = JSON.stringify([
  { quote: 'La virtud es la única recompensa.', attribution: 'Séneca', role: 'Estoico' },
  { text: 'No es la muerte lo que un hombre debe temer.', author: 'Marco Aurelio' },
  'Vive según la naturaleza.',
  { attribution: 'Sin texto — descartado' },
]);

describe('QuoteAnimatedElementComponent', () => {
  let fixture: ComponentFixture<QuoteAnimatedElementComponent>;
  let component: QuoteAnimatedElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteAnimatedElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuoteAnimatedElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no quotes (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasQuotes()).toBe(false);
    expect(component.canRotate()).toBe(false);
    expect(component.activeQuote()).toBeNull();
  });

  it('should normalize quotes and render the active one (render/config case)', async () => {
    fixture.componentRef.setInput('quotes', QUOTES);
    fixture.componentRef.setInput('animationMode', 'slide');
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid quotes survive (the entry without text is dropped).
    expect(component.quotes().length).toBe(3);
    expect(component.hasQuotes()).toBe(true);
    expect(component.canRotate()).toBe(true);
    expect(component.animationMode()).toBe('slide');

    const first = component.activeQuote();
    expect(first?.quote).toContain('La virtud');
    expect(first?.attribution).toBe('Séneca');

    const second = component.quotes()[1];
    expect(second.attribution).toBe('Marco Aurelio');
  });

  it('should advance and emit quotechange on next/goTo (interaction case)', async () => {
    fixture.componentRef.setInput('quotes', QUOTES);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: QuoteChangeDetail | undefined;
    component.quotechange.subscribe((detail) => (emitted = detail));

    component.next();
    expect(component.activeIndex()).toBe(1);
    expect(emitted?.index).toBe(1);
    expect(emitted?.quote.attribution).toBe('Marco Aurelio');

    // Wraps around past the end.
    component.goTo(2);
    component.next();
    expect(component.activeIndex()).toBe(0);
    expect(component.isActive(0)).toBe(true);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"quote":"Cita del config","animationMode":"fade"}');
    fixture.componentRef.setInput('quote', 'Cita del input');
    fixture.componentRef.setInput('animationMode', 'rise');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.activeQuote()?.quote).toBe('Cita del input');
    expect(component.animationMode()).toBe('rise');
  });
});

describe('quote-animated pure helpers', () => {
  it('normalizeQuotes accepts objects and bare strings, drops empties', () => {
    const quotes = normalizeQuotes([
      { quote: 'Uno', attribution: 'A' },
      { text: 'Dos', author: 'B' },
      'Tres',
      { attribution: 'sin texto' },
      42,
    ]);
    expect(quotes.length).toBe(3);
    expect(quotes[0].quote).toBe('Uno');
    expect(quotes[1].attribution).toBe('B');
    expect(quotes[2].quote).toBe('Tres');
  });

  it('normalizeQuotes returns empty for non-arrays', () => {
    expect(normalizeQuotes(undefined)).toEqual([]);
    expect(normalizeQuotes('nope')).toEqual([]);
  });
});
