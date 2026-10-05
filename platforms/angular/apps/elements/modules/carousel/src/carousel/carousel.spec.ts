import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CAROUSEL_SYNHOST } from '@synergos/contracts';
import { CarouselElementComponent } from './carousel';

describe('CarouselElementComponent', () => {
  let fixture: ComponentFixture<CarouselElementComponent>;
  let component: CarouselElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CarouselElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CarouselElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no slides (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.slides()).toEqual([]);
    expect(component.hasSlides()).toBe(false);
  });

  // El `config` trae lo que el editor autora (ADR 0135); el título no lo autora nadie en el
  // CMS, así que es atributo.
  it('should read config payloads, dropping slides without a src (happy + filter case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"slides":[{"src":"a.jpg","alt":"Sala"},{"alt":"sin src"},{"src":"b.jpg","label":"Fachada"}]}',
    );
    fixture.componentRef.setInput('title', 'Recorrido');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Recorrido');
    const slides = component.slides();
    expect(slides.length).toBe(2);
    expect(slides[0].src).toBe('a.jpg');
    expect(slides[1].label).toBe('Fachada');
  });

  // CMS#192, caso 4: `linkUrl` es la clave que el editor autora en `slidesJson`, y viaja.
  it('cada diapositiva enlaza a su `linkUrl`, y la que no lo trae no enlaza', async () => {
    fixture.componentRef.setInput(
      'config',
      JSON.stringify({ slides: [{ src: 'a.jpg', alt: 'Sala', linkUrl: '/propiedades/101' }, { src: 'b.jpg', alt: 'Patio' }] }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.slides().map((slide) => slide.href)).toEqual(['/propiedades/101', undefined]);
    const enlace = (fixture.nativeElement as HTMLElement).querySelector('a.syn-carousel__link');
    expect(enlace?.getAttribute('href')).toBe('/propiedades/101');
  });

  it('should parse slides, video included, from the slides attribute', async () => {
    fixture.componentRef.setInput('slides', '[{"src":"x.jpg"},{"src":"y.mp4","type":"video"}]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.slides().length).toBe(2);
    expect(component.slides()[1].type).toBe('video');
    expect(component.hasSlides()).toBe(true);
  });

  // D1: con `slidesJson` —el TEXTO que mandaba la vista— este elemento no encontraba
  // diapositivas y se ocultaba. Éste alimenta el `config` EXACTO que emite hoy la vista.
  it('muestra las diapositivas que el editor autoró con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = CAROUSEL_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasSlides()).toBe(true);
    expect(component.slides().map((s) => s.src)).toEqual(ejemplo.slides?.map((s) => s.src));
    expect(component.slides().map((s) => s.label)).toEqual(ejemplo.slides?.map((s) => s.label));
    expect(component.autoplay()).toBe(ejemplo.autoplay);
    expect(component.interval()).toBe(ejemplo.interval);
    expect((fixture.nativeElement as HTMLElement).style.display).not.toBe('none');
  });

  it('should let direct inputs override config', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config title"}');
    fixture.componentRef.setInput('title', 'Input title');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Input title');
  });

  it('should clamp interval to a sane minimum', async () => {
    fixture.componentRef.setInput('interval', 100);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.interval()).toBe(5000);
  });

  // ADR 0136 (CMS#186): la microcopia sale de la sección `Slider` que publica el bridge. Visto en
  // vivo en /propiedades: los botones decían «Previous»/«Next».
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO, nunca la clave ni el inglés de la hoja', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(CAROUSEL_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      const controles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.syn-carousel__control'));
      expect(controles.map((b) => b.textContent?.trim())).toEqual(['Diapositiva anterior', 'Siguiente diapositiva']);
      const total = CAROUSEL_SYNHOST.ejemplo.slides?.length ?? 0;
      expect(total).toBeGreaterThan(1);
      const escenario = (fixture.nativeElement as HTMLElement).querySelector('.syn-carousel__stage');
      expect(escenario?.getAttribute('aria-label')).toBe(`Diapositiva 1 de ${total}`);
    });

    it('con el bridge pinta el texto de las claves que publicó la página', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys: { 'Slider.Previous': 'Previous slide', 'Slider.Next': 'Next slide' } },
      };
      const otra = TestBed.createComponent(CarouselElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(CAROUSEL_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();

      const controles = Array.from((otra.nativeElement as HTMLElement).querySelectorAll('.syn-carousel__control'));
      expect(controles.map((b) => b.textContent?.trim())).toEqual(['Previous slide', 'Next slide']);
    });
  });

  // WCAG 2.2.2 (#199): lo que se mueve solo más de 5 s se tiene que poder pausar. El carrusel
  // avanzaba con `setInterval` y no había cómo detenerlo; `Slider.Pause`/`Slider.Play` viajaban
  // en la sección `Slider` y nadie las leía.
  describe('pausa del autoplay', () => {
    const DOS = JSON.stringify([{ src: 'a.jpg' }, { src: 'b.jpg' }]);

    afterEach(() => {
      vi.useRealTimers();
    });

    function montar(autoplay: boolean, slides = DOS) {
      vi.useFakeTimers();
      const f = TestBed.createComponent(CarouselElementComponent);
      f.componentRef.setInput('slides', slides);
      f.componentRef.setInput('autoplay', autoplay);
      f.componentRef.setInput('interval', 1000);
      f.detectChanges();
      return f;
    }

    const boton = (f: ComponentFixture<CarouselElementComponent>): HTMLButtonElement | null =>
      (f.nativeElement as HTMLElement).querySelector('.carousel__autoplay-toggle button');

    function pasar(f: ComponentFixture<CarouselElementComponent>, ms: number): void {
      vi.advanceTimersByTime(ms);
      f.detectChanges();
    }

    it('sin autoplay, o con una sola diapositiva, no hay botón: nada se mueve', () => {
      expect(boton(montar(false))).toBeNull();
      expect(boton(montar(true, JSON.stringify([{ src: 'a.jpg' }])))).toBeNull();
    });

    it('pausar detiene el avance y reproducir lo reanuda, con la etiqueta del diccionario', () => {
      const f = montar(true);
      expect(boton(f)?.getAttribute('aria-label')).toBe('Pausar presentación');

      pasar(f, 1000);
      expect(f.componentInstance.activeIndex()).toBe(1);

      boton(f)?.click();
      f.detectChanges();
      expect(boton(f)?.getAttribute('aria-label')).toBe('Reproducir presentación');
      pasar(f, 5000);
      expect(f.componentInstance.activeIndex()).toBe(1);

      boton(f)?.click();
      f.detectChanges();
      pasar(f, 1000);
      expect(f.componentInstance.activeIndex()).toBe(0);
    });
  });
});
