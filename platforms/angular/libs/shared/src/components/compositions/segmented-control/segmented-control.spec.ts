import { TestBed } from '@angular/core/testing';
import { SegmentedControlComponent } from './segmented-control';

describe(SegmentedControlComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SegmentedControlComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SegmentedControlComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits the selected option id', () => {
    const fixture = TestBed.createComponent(SegmentedControlComponent);
    const values: string[] = [];
    fixture.componentInstance.activeIdChange.subscribe((value) => values.push(value));
    fixture.componentRef.setInput('options', [
      { id: 'outbound', label: 'Outbound' },
      { id: 'return', label: 'Return' },
    ]);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.syn-segmented-control__option');
    (buttons[1] as HTMLButtonElement).click();

    expect(values).toEqual(['return']);
  });

  it('navigates hidden segments when overflow exists', () => {
    const fixture = TestBed.createComponent(SegmentedControlComponent);
    fixture.componentRef.setInput('maxVisible', 2);
    fixture.componentRef.setInput('options', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelectorAll('.syn-segmented-control__nav')[1] as HTMLButtonElement;
    nextButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('C');
  });
});
