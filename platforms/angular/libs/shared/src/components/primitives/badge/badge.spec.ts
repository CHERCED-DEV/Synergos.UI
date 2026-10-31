import { TestBed } from '@angular/core/testing';
import { BadgeComponent } from './badge';

describe(BadgeComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BadgeComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders badge text', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('text', 'Beta');
    fixture.detectChanges();

    const span = fixture.nativeElement.querySelector('span') as HTMLSpanElement;
    expect(span.textContent?.trim()).toBe('Beta');
  });

  // 014-despiece-tienda: una insignia es una etiqueta; la región viva va sólo cuando se pide.
  it('is not a live region unless asked', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('text', '3');
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('.syn-badge') as HTMLElement;
    expect(span.hasAttribute('role')).toBe(false);

    fixture.componentRef.setInput('live', true);
    fixture.detectChanges();
    expect(span.getAttribute('role')).toBe('status');
  });

  it('writes an accessible name that differs from the text, hidden from sight', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('text', '2');
    fixture.componentRef.setInput('ariaLabel', '2 artículos');
    fixture.detectChanges();
    const sr = fixture.nativeElement.querySelector('.syn-badge__sr') as HTMLElement;
    expect(sr.textContent?.trim()).toBe('2 artículos');
    expect(fixture.nativeElement.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('2');
  });
});