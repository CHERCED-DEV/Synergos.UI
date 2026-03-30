import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
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

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', 'Special Offer');
    fixture.detectChanges();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector('.banner__title');
    expect(title?.textContent?.trim()).toBe('Special Offer');
  });

  it('should render CTA when label and url are provided', async () => {
    fixture.componentRef.setInput('ctaLabel', 'Learn More');
    fixture.componentRef.setInput('ctaUrl', 'https://example.com');
    fixture.detectChanges();
    await fixture.whenStable();

    const cta = fixture.nativeElement.querySelector('.banner__cta-link');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('https://example.com');
  });
});
