import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CardComponent } from './card';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', 'Test Card');
    fixture.detectChanges();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector('.card__title');
    expect(title?.textContent?.trim()).toBe('Test Card');
  });

  it('should render body when provided', async () => {
    fixture.componentRef.setInput('body', 'Card body text');
    fixture.detectChanges();
    await fixture.whenStable();

    const body = fixture.nativeElement.querySelector('.card__body');
    expect(body?.textContent?.trim()).toBe('Card body text');
  });

  it('should render badge when badgeText is provided', async () => {
    fixture.componentRef.setInput('badgeText', 'New');
    fixture.componentRef.setInput('badgeType', 'info');
    fixture.detectChanges();
    await fixture.whenStable();

    const badge = fixture.nativeElement.querySelector('.card__badge');
    expect(badge?.textContent?.trim()).toBe('New');
  });

  it('should render CTA when label and url are provided', async () => {
    fixture.componentRef.setInput('ctaLabel', 'Read More');
    fixture.componentRef.setInput('ctaUrl', 'https://example.com');
    fixture.detectChanges();
    await fixture.whenStable();

    const cta = fixture.nativeElement.querySelector('.card__cta');
    expect(cta?.textContent?.trim()).toBe('Read More');
    expect(cta?.getAttribute('href')).toBe('https://example.com');
  });
});
