import { TestBed } from '@angular/core/testing';
import { HeadingComponent } from './heading';

describe(HeadingComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeadingComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(HeadingComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the selected semantic heading level', () => {
    const fixture = TestBed.createComponent(HeadingComponent);
    fixture.componentRef.setInput('level', 'h3');
    fixture.componentRef.setInput('text', 'Booking summary');
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h3') as HTMLHeadingElement;
    expect(heading.textContent?.trim()).toBe('Booking summary');
  });

  it('renders supporting text when provided', () => {
    const fixture = TestBed.createComponent(HeadingComponent);
    fixture.componentRef.setInput('text', 'Need help?');
    fixture.componentRef.setInput('supportingText', 'Choose one of the available actions below.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Choose one of the available actions below.');
  });
});
