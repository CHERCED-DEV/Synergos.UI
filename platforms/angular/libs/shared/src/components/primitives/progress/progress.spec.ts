import { TestBed } from '@angular/core/testing';
import { ProgressComponent } from './progress';

describe(ProgressComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ProgressComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calculates percentage-based progress values', () => {
    const fixture = TestBed.createComponent(ProgressComponent);
    fixture.componentRef.setInput('value', 40);
    fixture.componentRef.setInput('max', 80);
    fixture.detectChanges();

    const progressBar = fixture.nativeElement.querySelector('.syn-progress__bar') as HTMLElement;
    expect(progressBar.style.width).toBe('50%');
    expect(fixture.nativeElement.textContent).toContain('50%');
  });
});
