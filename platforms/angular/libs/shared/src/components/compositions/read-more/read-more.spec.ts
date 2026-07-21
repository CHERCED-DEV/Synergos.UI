import { TestBed } from '@angular/core/testing';
import { ReadMoreComponent } from './read-more';

describe(ReadMoreComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadMoreComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ReadMoreComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('toggles between summary and full content', () => {
    const fixture = TestBed.createComponent(ReadMoreComponent);
    fixture.componentRef.setInput('summary', 'Short copy');
    fixture.componentRef.setInput('content', 'Extended copy for the module');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Short copy');

    const button = fixture.nativeElement.querySelector('.syn-button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Extended copy for the module');
  });

  it('does not render a toggle button when only one text variant exists', () => {
    const fixture = TestBed.createComponent(ReadMoreComponent);
    fixture.componentRef.setInput('content', 'Single block');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-button')).toBeNull();
  });
});
