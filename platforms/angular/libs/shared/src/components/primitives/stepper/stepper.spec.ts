import { TestBed } from '@angular/core/testing';
import { StepperComponent } from './stepper';

describe(StepperComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StepperComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(StepperComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('increments the value when clicking the plus button', () => {
    const fixture = TestBed.createComponent(StepperComponent);
    const emitted: number[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => {
      emitted.push(value);
    });
    fixture.componentRef.setInput('value', 1);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.syn-stepper__button');
    (buttons[1] as HTMLButtonElement).click();

    expect(emitted).toEqual([2]);
  });

  it('does not increment past max value', () => {
    const fixture = TestBed.createComponent(StepperComponent);
    fixture.componentRef.setInput('value', 3);
    fixture.componentRef.setInput('max', 3);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.syn-stepper__button');
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  });
});
