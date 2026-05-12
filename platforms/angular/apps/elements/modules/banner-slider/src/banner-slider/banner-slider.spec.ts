import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  BannerSliderElementComponent,
  normalizeSlide,
  normalizeSlides,
  sanitizeBannerSliderConfig,
} from './banner-slider';

describe('BannerSliderElementComponent', () => {
  let fixture: ComponentFixture<BannerSliderElementComponent>;
  let component: BannerSliderElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BannerSliderElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BannerSliderElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"headingText":"Featured stories","autoplay":true,"loop":false,"theme":"dark","items":[{"id":"a","label":"Launch","body":"<p>Release note.</p>","src":"slide-a.jpg","alt":"Launch","ctaLabel":"Read","ctaUrl":"https://example.com"}]}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.headingText()).toBe('Featured stories');
    expect(component.autoplay()).toBe(true);
    expect(component.loop()).toBe(false);
    expect(component.activeSlide()?.label).toBe('Launch');
  });

  it('should parse direct items json input', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"id":"a","label":"Launch","src":"slide-a.jpg"},{"id":"b","label":"Review","src":"slide-b.jpg"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedItems().length).toBe(2);
    expect(component.activeSlide()?.label).toBe('Launch');
  });

  it('should switch active slide', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"id":"a","label":"Launch","src":"slide-a.jpg"},{"id":"b","label":"Review","src":"slide-b.jpg"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    component.setActiveIndex(1);
    fixture.detectChanges();

    expect(component.activeSlide()?.label).toBe('Review');
  });

  it('should render slide cta', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"id":"a","label":"Launch","src":"slide-a.jpg","ctaLabel":"Read","ctaUrl":"https://example.com"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const cta = fixture.nativeElement.querySelector('.banner-slider__cta-link') as HTMLAnchorElement | null;
    expect(cta?.getAttribute('href')).toBe('https://example.com');
  });

  it('should normalize legacy slide fields and filter empty entries', () => {
    expect(
      normalizeSlides([
        { src: 'one.jpg', label: 'One', ctaUrl: '/one' },
        { imageSrc: 'two.jpg', title: 'Two', imageAlt: 'Two alt' },
        { body: '   ' },
      ]),
    ).toEqual([
      {
        id: 'slide-1',
        label: 'One',
        body: '',
        src: 'one.jpg',
        alt: '',
        ctaLabel: '',
        ctaUrl: '/one',
        ctaTarget: '_self',
      },
      {
        id: 'slide-2',
        label: 'Two',
        body: '',
        src: 'two.jpg',
        alt: 'Two alt',
        ctaLabel: '',
        ctaUrl: '',
        ctaTarget: '_self',
      },
    ]);
    expect(normalizeSlide({ body: '  ' }, 0)).toBeNull();
  });

  it('should sanitize config booleans and slide payloads', () => {
    const config = sanitizeBannerSliderConfig({
      headingText: '  Featured  ',
      autoplay: true,
      loop: false,
      slides: [{ imageSrc: 'one.jpg', title: 'One' }],
    });

    expect(config.headingText).toBe('Featured');
    expect(config.autoplay).toBe(true);
    expect(config.loop).toBe(false);
    expect(config.slides).toHaveLength(1);
  });
});
