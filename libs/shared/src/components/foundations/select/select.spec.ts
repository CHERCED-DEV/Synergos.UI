import { TestBed } from '@angular/core/testing';
import { SelectComponent } from './select';

describe(SelectComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('options', [{ value: 'a', label: 'A' }]);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits selected value', () => {
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);

    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change'));

    expect(changed).toHaveBeenCalledWith('b');
  });
});