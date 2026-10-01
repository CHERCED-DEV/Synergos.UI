import { TestBed } from '@angular/core/testing';
import { CarouselComponent } from './carousel';

describe(CarouselComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CarouselComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the active image item', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [
      { src: '/hero.jpg', alt: 'Hero image' },
      { src: '/detail.jpg', alt: 'Detail image' },
    ]);
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.syn-carousel__media') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/hero.jpg');
  });

  it('moves to the next slide when requested', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [
      { src: '/hero.jpg', alt: 'Hero image' },
      { src: '/detail.jpg', alt: 'Detail image' },
    ]);
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelectorAll('.syn-carousel__control')[1] as HTMLButtonElement;
    nextButton.click();
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.syn-carousel__media') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/detail.jpg');
  });

  // ADR 0136 (CMS#186): la hoja recibe TEXTO. Pintaba «Previous»/«Next» escritos acá, en inglés,
  // en un sitio en español; quien la monta los traduce y se los pasa.
  it('pinta los rótulos que recibe, no los suyos', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [{ src: '/a.jpg' }, { src: '/b.jpg', label: 'Fachada' }]);
    fixture.componentRef.setInput('previousLabel', 'Diapositiva anterior');
    fixture.componentRef.setInput('nextLabel', 'Siguiente diapositiva');
    fixture.componentRef.setInput('pagerLabel', 'Diapositivas');
    fixture.componentRef.setInput('slideLabel', 'Ir a diapositiva {n}');
    fixture.detectChanges();

    const raiz = fixture.nativeElement as HTMLElement;
    const controles = Array.from(raiz.querySelectorAll('.syn-carousel__control')).map((b) => b.textContent?.trim());
    expect(controles).toEqual(['Diapositiva anterior', 'Siguiente diapositiva']);
    expect(raiz.querySelector('.syn-carousel__pager')?.getAttribute('aria-label')).toBe('Diapositivas');
    const miniaturas = Array.from(raiz.querySelectorAll('.syn-carousel__thumb')).map((b) => b.getAttribute('aria-label'));
    expect(miniaturas).toEqual(['Ir a diapositiva 1', 'Fachada']);
  });
});
