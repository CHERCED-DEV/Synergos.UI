import { TestBed } from '@angular/core/testing';
import { ToggleComponent } from './toggle';

describe(ToggleComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToggleComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ToggleComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits the checked state when the input changes', () => {
    const fixture = TestBed.createComponent(ToggleComponent);
    const checkedStates: boolean[] = [];
    fixture.componentInstance.checkedChange.subscribe((value) => checkedStates.push(value));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.syn-toggle__native') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(checkedStates).toEqual([true]);
  });

  it('renders label and description content', () => {
    const fixture = TestBed.createComponent(ToggleComponent);
    fixture.componentRef.setInput('label', 'Receive alerts');
    fixture.componentRef.setInput('description', 'Enable booking updates');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Receive alerts');
    expect(fixture.nativeElement.textContent).toContain('Enable booking updates');
  });
});
