import { TestBed } from '@angular/core/testing';
import { CheckboxComponent } from './checkbox';

describe(CheckboxComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckboxComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CheckboxComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits checked changes', () => {
    const fixture = TestBed.createComponent(CheckboxComponent);
    const changed = vi.fn();
    fixture.componentInstance.checkedChange.subscribe(changed);
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(changed).toHaveBeenCalledWith(true);
  });
});