import { TestBed } from '@angular/core/testing';
import { SpinnerComponent } from './spinner';

describe(SpinnerComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpinnerComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SpinnerComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the accessible loading label', () => {
    const fixture = TestBed.createComponent(SpinnerComponent);
    fixture.componentRef.setInput('label', 'Fetching records');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Fetching records');
  });
});
