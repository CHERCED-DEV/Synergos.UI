import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should honor supported heading levels through shared heading', async () => {
    fixture.componentRef.setInput('headingText', 'Welcome');
    fixture.componentRef.setInput('headingLevel', 'h2');
    fixture.detectChanges();
    await fixture.whenStable();

    const heading = fixture.nativeElement.querySelector('.hero__heading h2');
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

    const cta = fixture.nativeElement.querySelector('.hero__cta-link');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('https://example.com');
  });

  it('should resolve its base content from config and keep explicit inputs as overrides', async () => {
    fixture.componentRef.setInput('config', {
      headingText: 'Config Hero',
      body: 'Config body',
      ctaLabel: 'Config CTA',
      ctaUrl: 'https://config.example',
      theme: 'dark',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.headingText()).toBe('Config Hero');
    expect(component.body()).toBe('Config body');
    expect(component.theme()).toBe('dark');

    fixture.componentRef.setInput('headingText', 'Override Hero');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.headingText()).toBe('Override Hero');
  });
});
