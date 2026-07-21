import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
