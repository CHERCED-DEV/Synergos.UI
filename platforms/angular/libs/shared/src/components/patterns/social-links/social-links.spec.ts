import { TestBed } from '@angular/core/testing';
import { SocialLinksComponent } from './social-links';

describe(SocialLinksComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialLinksComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SocialLinksComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders each social link', () => {
    const fixture = TestBed.createComponent(SocialLinksComponent);
    fixture.componentRef.setInput('links', [
      { label: 'Facebook', href: 'https://facebook.com', iconSymbol: 'f' },
      { label: 'LinkedIn', href: 'https://linkedin.com', iconSymbol: 'in' },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Facebook');
    expect(fixture.nativeElement.textContent).toContain('LinkedIn');
  });
});
