import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HeroComponent } from './hero';

describe('HeroComponent', () => {
  let fixture: ComponentFixture<HeroComponent>;
  let component: HeroComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HeroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render heading when provided', async () => {
    fixture.componentRef.setInput('headingText', 'Welcome');
    fixture.detectChanges();
    await fixture.whenStable();

    const heading = fixture.nativeElement.querySelector('.hero__heading');
    expect(heading?.textContent?.trim()).toBe('Welcome');
  });

  it('should render body text when provided', async () => {
    fixture.componentRef.setInput('body', 'Some body text');
    fixture.detectChanges();
    await fixture.whenStable();

    const body = fixture.nativeElement.querySelector('.hero__body');
    expect(body?.textContent?.trim()).toBe('Some body text');
  });

  it('should render CTA when label and url are provided', async () => {
    fixture.componentRef.setInput('ctaLabel', 'Click Me');
    fixture.componentRef.setInput('ctaUrl', 'https://example.com');
    fixture.detectChanges();
    await fixture.whenStable();

    const cta = fixture.nativeElement.querySelector('.hero__cta');
    expect(cta?.textContent?.trim()).toBe('Click Me');
    expect(cta?.getAttribute('href')).toBe('https://example.com');
  });
});
