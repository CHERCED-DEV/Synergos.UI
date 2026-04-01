import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon';

describe(IconComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the provided symbol', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('symbol', '+');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('+');
  });

  it('sets accessible labelling when not decorative', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('symbol', 'i');
    fixture.componentRef.setInput('label', 'Information');
    fixture.componentRef.setInput('decorative', false);
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('.syn-icon') as HTMLElement;
    expect(icon.getAttribute('aria-label')).toBe('Information');
  });
});
