import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LIGHTBOX_GALLERY_SYNHOST } from '@synergos/contracts';
import { LightboxGalleryElementComponent, normalizeImages } from './lightbox-gallery';

const IMAGES = JSON.stringify([
  { src: '/media/casa-1.jpg', alt: 'Fachada', caption: 'Fachada principal' },
  { src: '/media/casa-2.jpg', thumb: '/media/casa-2-thumb.jpg', alt: 'Sala' },
  { src: '/media/casa-3.jpg', caption: 'Cocina integral' },
  { alt: 'Sin src — descartada' },
]);

describe('LightboxGalleryElementComponent', () => {
  let fixture: ComponentFixture<LightboxGalleryElementComponent>;
  let component: LightboxGalleryElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LightboxGalleryElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LightboxGalleryElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no images and stay closed (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasImages()).toBe(false);
    expect(component.isOpen()).toBe(false);
    expect(component.images()).toEqual([]);
  });

  it('should normalize images from config, dropping entries without src (render/config case)', async () => {
    fixture.componentRef.setInput('images', IMAGES);
    fixture.detectChanges();
    await fixture.whenStable();

    const images = component.images();
    expect(images.length).toBe(3);
    expect(component.hasImages()).toBe(true);
    // thumb falls back to src when not provided.
    expect(images[0].thumb).toBe('/media/casa-1.jpg');
    // explicit thumb is preserved.
    expect(images[1].thumb).toBe('/media/casa-2-thumb.jpg');
  });

  // D1: con el TEXTO `imagesJson` —lo que mandaba la vista— la galería decía «No hay imágenes».
  // Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta las imágenes y las columnas del editor con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = LIGHTBOX_GALLERY_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasImages()).toBe(true);
    expect(component.images().map((i) => i.src)).toEqual(ejemplo.images?.map((i) => i.src));
    expect(component.images().map((i) => i.thumb)).toEqual(ejemplo.images?.map((i) => i.thumb));
    expect(component.images().map((i) => i.caption)).toEqual(ejemplo.images?.map((i) => i.caption));
    expect(component.columns()).toBe(ejemplo.columns);
  });

  it('should open, navigate and close the lightbox (interaction case)', async () => {
    fixture.componentRef.setInput('images', IMAGES);
    fixture.detectChanges();
    await fixture.whenStable();

    component.open(0);
    expect(component.isOpen()).toBe(true);
    expect(component.openIndex()).toBe(0);
    expect(component.activeImage()?.caption).toBe('Fachada principal');
    expect(component.counterLabel()).toBe('1 / 3');

    component.next();
    expect(component.openIndex()).toBe(1);

    // wraps from last back to first.
    component.next();
    component.next();
    expect(component.openIndex()).toBe(0);

    // previous wraps to the last image.
    component.previous();
    expect(component.openIndex()).toBe(2);

    component.close();
    expect(component.isOpen()).toBe(false);
    expect(component.activeImage()).toBeNull();
  });

  it('should let direct inputs override config and clamp columns (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"columns":2}');
    fixture.componentRef.setInput('columns', '4');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.columns()).toBe(4);

    // out-of-range values clamp into [1, 6].
    fixture.componentRef.setInput('columns', '99');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.columns()).toBe(6);
  });

  it('should map Escape and arrow keys to close/next/previous', async () => {
    fixture.componentRef.setInput('images', IMAGES);
    fixture.detectChanges();
    await fixture.whenStable();

    component.open(0);

    component.onDialogKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.openIndex()).toBe(1);

    component.onDialogKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.openIndex()).toBe(0);

    component.onDialogKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isOpen()).toBe(false);
  });

  // ADR 0136 (CMS#191): la microcopia sale de la sección `Gallery` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(LIGHTBOX_GALLERY_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.lightbox-gallery__grid')?.getAttribute('aria-label')).toBe('Galería de imágenes');
      expect(raiz.querySelector('.lightbox-gallery__thumb')?.getAttribute('aria-label')).toBe('Ampliar imagen 1: La sala');
      expect(component.closeLabel()).toBe('Cerrar galería');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: { 'Gallery.Enlarge': 'Enlarge image {n}', 'Gallery.Next': 'Next image', 'Gallery.Close': 'Close gallery' },
        },
      };
      const otra = TestBed.createComponent(LightboxGalleryElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(LIGHTBOX_GALLERY_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();

      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.lightbox-gallery__thumb')?.getAttribute('aria-label')).toBe('Enlarge image 1: La sala');
      otra.componentInstance.open(0);
      otra.detectChanges();
      expect(raiz.querySelector('.lightbox__nav--next')?.getAttribute('aria-label')).toBe('Next image');
      expect(raiz.querySelector('.lightbox__close')?.getAttribute('aria-label')).toBe('Close gallery');
      expect(raiz.querySelector('.lightbox__nav--prev')?.getAttribute('aria-label')).toBe('Imagen anterior');
      otra.componentInstance.close();
    });
  });
});

describe('lightbox-gallery pure helpers', () => {
  it('normalizeImages accepts strings and objects, drops invalid entries', () => {
    const images = normalizeImages([
      'https://cdn.example.com/a.jpg',
      { src: '/b.jpg', alt: 'B' },
      { alt: 'sin src' },
      42,
    ]);
    expect(images.length).toBe(2);
    expect(images[0].src).toBe('https://cdn.example.com/a.jpg');
    expect(images[1].alt).toBe('B');
  });
});
