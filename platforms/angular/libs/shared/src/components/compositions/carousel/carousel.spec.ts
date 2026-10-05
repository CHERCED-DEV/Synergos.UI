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

  // CMS#192, caso 4: la diapositiva con destino es un enlace; el vídeo y la que no lo tiene, no.
  it('hace de la imagen el enlace cuando la diapositiva trae destino', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [
      { src: '/hero.jpg', alt: 'Sala principal', href: '/propiedades/101' },
      { src: '/fachada.jpg', label: 'Fachada', href: '/propiedades/102' },
      { src: '/plano.jpg', alt: 'Plano' },
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    let enlace = host.querySelector('a.syn-carousel__link');
    expect(enlace?.getAttribute('href')).toBe('/propiedades/101');
    expect(enlace?.querySelector('img')?.getAttribute('alt')).toBe('Sala principal');
    expect(enlace?.hasAttribute('aria-label')).toBe(false);

    fixture.componentInstance.select(1);
    fixture.detectChanges();
    enlace = host.querySelector('a.syn-carousel__link');
    // Sin alt, el nombre del enlace es el rótulo: un enlace sin nombre no dice a dónde va.
    expect(enlace?.getAttribute('aria-label')).toBe('Fachada');

    fixture.componentInstance.select(2);
    fixture.detectChanges();
    expect(host.querySelector('a.syn-carousel__link')).toBeNull();
    expect(host.querySelector('img.syn-carousel__media')?.getAttribute('src')).toBe('/plano.jpg');
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

  // #199: el escenario mostraba una diapositiva y no decía cuál; ahora se nombra «n de total».
  it('nombra la diapositiva visible con su posición, y la sigue al avanzar', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [{ src: '/a.jpg' }, { src: '/b.jpg' }, { src: '/c.jpg' }]);
    fixture.componentRef.setInput('slidePositionLabel', 'Diapositiva {n} de {total}');
    fixture.detectChanges();

    const escenario = (): Element | null => (fixture.nativeElement as HTMLElement).querySelector('.syn-carousel__stage');
    expect(escenario()?.getAttribute('role')).toBe('group');
    expect(escenario()?.getAttribute('aria-label')).toBe('Diapositiva 1 de 3');

    fixture.componentInstance.next();
    fixture.detectChanges();
    expect(escenario()?.getAttribute('aria-label')).toBe('Diapositiva 2 de 3');
  });

  it('con una sola diapositiva no hay posición que anunciar', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [{ src: '/a.jpg' }]);
    fixture.detectChanges();

    const escenario = (fixture.nativeElement as HTMLElement).querySelector('.syn-carousel__stage');
    expect(escenario?.getAttribute('role')).toBeNull();
    expect(escenario?.getAttribute('aria-label')).toBeNull();
  });
});
