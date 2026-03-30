import { TestBed } from '@angular/core/testing';
import { DropdownComponent } from './dropdown';

describe(DropdownComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropdownComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(DropdownComponent);
    fixture.componentRef.setInput('items', [{ id: 'one', label: 'One' }]);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits selected item id', () => {
    const fixture = TestBed.createComponent(DropdownComponent);
    fixture.componentRef.setInput('items', [
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ]);

    const selected = vi.fn();
    fixture.componentInstance.itemSelected.subscribe(selected);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.syn-dropdown__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelectorAll('.syn-dropdown__item')[1] as HTMLButtonElement;
    item.click();

    expect(selected).toHaveBeenCalledWith('two');
  });
});