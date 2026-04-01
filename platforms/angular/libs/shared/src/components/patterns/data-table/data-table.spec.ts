import { TestBed } from '@angular/core/testing';
import { DataTableComponent, type DataTableColumn } from './data-table';

describe(DataTableComponent.name, () => {
  const columns: readonly DataTableColumn<Record<string, unknown>>[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status' },
  ];

  const rows: readonly Record<string, unknown>[] = [{ name: 'Appointments', status: 'Ready' }];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTableComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits sort changes for sortable columns', () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    const sortChange = vi.fn();
    fixture.componentInstance.sortChange.subscribe(sortChange);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-data-table__sort') as HTMLButtonElement;
    button.click();

    expect(sortChange).toHaveBeenCalledWith({ key: 'name', direction: 'asc' });
  });

  it('emits row selection events', () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    const rowSelected = vi.fn();
    fixture.componentInstance.rowSelected.subscribe(rowSelected);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.syn-data-table__row') as HTMLTableRowElement;
    row.click();

    expect(rowSelected).toHaveBeenCalledWith(rows[0]);
  });
});
