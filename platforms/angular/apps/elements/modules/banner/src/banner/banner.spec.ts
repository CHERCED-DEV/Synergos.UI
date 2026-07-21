import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BannerComponent } from './banner';

describe('BannerComponent', () => {
  let fixture: ComponentFixture<BannerComponent>;
  let component: BannerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BannerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render eyebrow when provided', async () => {
    fixture.componentRef.setInput('eyebrow', 'Oferta especial');
    fixture.detectChanges();
    await fixture.whenStable();

    const eyebrow = fixture.nativeElement.querySelector('.banner__eyebrow');
    expect(eyebrow?.textContent?.trim()).toBe('Oferta especial');
  });

  it('should not render eyebrow when empty', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const eyebrow = fixture.nativeElement.querySelector('.banner__eyebrow');
    expect(eyebrow).toBeNull();
  });

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', 'Special Offer');
    fixture.detectChanges();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector('.banner__title');
    expect(title?.textContent?.trim()).toBe('Special Offer');
  });

  it('should render image when imageSrc is provided', async () => {
    fixture.componentRef.setInput('imageSrc', '/images/banner.jpg');
    fixture.componentRef.setInput('imageAlt', 'Banner image');
    fixture.detectChanges();
    await fixture.whenStable();

    const img = fixture.nativeElement.querySelector('.banner__image');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/images/banner.jpg');
    expect(img?.getAttribute('alt')).toBe('Banner image');
  });

  it('should not render image when imageSrc is empty', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const img = fixture.nativeElement.querySelector('.banner__image');
    expect(img).toBeNull();
  });

  it('should add --with-image modifier class when image is present', async () => {
    fixture.componentRef.setInput('imageSrc', '/img.jpg');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement.querySelector('.sg-banner');
    expect(host?.className).toContain('sg-banner--with-image');
  });

  it('should render primary CTA when label and url are provided', async () => {
    fixture.componentRef.setInput('ctaLabel', 'Learn More');
    fixture.componentRef.setInput('ctaUrl', 'https://example.com');
    fixture.detectChanges();
    await fixture.whenStable();

    const cta = fixture.nativeElement.querySelector('.banner__cta-link');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('https://example.com');
  });

  it('should render secondary CTA when secondaryCtaLabel and url are provided', async () => {
    fixture.componentRef.setInput('secondaryCtaLabel', 'Ver más');
    fixture.componentRef.setInput('secondaryCtaUrl', '/more');
    fixture.detectChanges();
    await fixture.whenStable();

    const links = fixture.nativeElement.querySelectorAll('.banner__cta-link');
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute('href')).toBe('/more');
  });

  it('should open CTA in new tab when ctaTarget is _blank', async () => {
    fixture.componentRef.setInput('ctaLabel', 'Go');
    fixture.componentRef.setInput('ctaUrl', '/link');
    fixture.componentRef.setInput('ctaTarget', '_blank');
    fixture.detectChanges();
    await fixture.whenStable();

    const cta = fixture.nativeElement.querySelector('.banner__cta-link');
    expect(cta?.getAttribute('target')).toBe('_blank');
  });

  it('should apply dark modifier class', async () => {
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement.querySelector('.sg-banner');
    expect(host?.className).toContain('sg-banner--dark');
  });

  it('should parse config attribute and apply values', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"eyebrow":"New","title":"Hello","ctaLabel":"Click","ctaUrl":"/go"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.eyebrow()).toBe('New');
    expect(component.title()).toBe('Hello');
    expect(component.ctaLabel()).toBe('Click');
  });
});
