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
});
