import { TestBed } from '@angular/core/testing';
import { LinkComponent } from './link';

describe(LinkComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(LinkComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits activated when used as a button', () => {
    const fixture = TestBed.createComponent(LinkComponent);
    const activated = vi.fn();
    fixture.componentInstance.activated.subscribe(activated);
    fixture.componentRef.setInput('label', 'Learn more');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(activated).toHaveBeenCalledTimes(1);
  });

  it('adds a secure rel for external links by default', () => {
    const fixture = TestBed.createComponent(LinkComponent);
    fixture.componentRef.setInput('href', 'https://example.com');
    fixture.componentRef.setInput('target', '_blank');
    fixture.detectChanges();

    const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
