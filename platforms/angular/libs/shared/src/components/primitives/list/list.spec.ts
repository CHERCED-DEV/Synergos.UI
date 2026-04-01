import { TestBed } from '@angular/core/testing';
import { ListComponent } from './list';

describe(ListComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ListComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders each list item label', () => {
    const fixture = TestBed.createComponent(ListComponent);
    fixture.componentRef.setInput('items', [
      { label: 'Carry-on included' },
      { label: 'Seat selection available' },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Carry-on included');
    expect(fixture.nativeElement.textContent).toContain('Seat selection available');
  });

  it('emits selected items when interactive', () => {
    const fixture = TestBed.createComponent(ListComponent);
    const selected: string[] = [];
    fixture.componentInstance.itemSelected.subscribe((item) => {
      selected.push(item.label);
    });
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('items', [{ label: 'Priority boarding' }]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.syn-list__row') as HTMLDivElement;
    row.click();

    expect(selected).toEqual(['Priority boarding']);
  });
});
