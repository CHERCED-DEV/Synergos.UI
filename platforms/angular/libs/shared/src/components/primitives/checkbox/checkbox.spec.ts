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

  // 014-despiece-tienda: cada instancia tiene su id; antes todas acababan con el último número y cada <label for> apuntaba a la misma.
  it('gives each instance its own id', () => {
    const a = TestBed.createComponent(CheckboxComponent);
    const b = TestBed.createComponent(CheckboxComponent);
    a.detectChanges();
    b.detectChanges();

    expect(a.componentInstance.fieldId()).not.toBe(b.componentInstance.fieldId());
  });
});