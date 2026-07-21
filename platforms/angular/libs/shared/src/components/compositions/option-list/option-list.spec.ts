import { TestBed } from '@angular/core/testing';
import { OptionListComponent } from './option-list';

describe(OptionListComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionListComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(OptionListComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits single selection changes', () => {
    const fixture = TestBed.createComponent(OptionListComponent);
    const selections: string[][] = [];
    fixture.componentInstance.selectionChange.subscribe((selection) => {
      selections.push([...selection]);
    });
    fixture.componentRef.setInput('items', [{ id: 'economy', label: 'Economy' }]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-option-list__option') as HTMLButtonElement;
    button.click();

    expect(selections).toEqual([['economy']]);
  });

  it('toggles items in multiple selection mode', () => {
    const fixture = TestBed.createComponent(OptionListComponent);
    const selections: string[][] = [];
    fixture.componentInstance.selectionChange.subscribe((selection) => {
      selections.push([...selection]);
    });
    fixture.componentRef.setInput('selectionMode', 'multiple');
    fixture.componentRef.setInput('items', [{ id: 'bag', label: 'Checked bag' }]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-option-list__option') as HTMLButtonElement;
    button.click();
    button.click();

    expect(selections).toEqual([['bag'], []]);
  });
});
