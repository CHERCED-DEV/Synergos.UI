import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DataTableElementComponent,
  columnsFromHeaders,
  normalizeColumns,
  normalizeRowsFromMatrix,
  sanitizeDataTableConfig,
} from './data-table';

describe('DataTableElementComponent', () => {
  let fixture: ComponentFixture<DataTableElementComponent>;
  let component: DataTableElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTableElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DataTableElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"caption":"Users","rows":[{"name":"Ana"}],"columns":[{"key":"name","label":"Name"}]}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.caption()).toBe('Users');
    expect(component.parsedRows()).toEqual([{ name: 'Ana' }]);
    expect(component.parsedColumns()[0]?.label).toBe('Name');
  });

  it('should parse direct json inputs', async () => {
    fixture.componentRef.setInput('rows', '[{"status":"Active"}]');
    fixture.componentRef.setInput('columns', '[{"key":"status","label":"Status","sortable":true}]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedRows()[0]?.['status']).toBe('Active');
    expect(component.parsedColumns()[0]?.sortable).toBe(true);
  });

  it('should derive columns from headers and normalize matrix rows', () => {
    const columns = columnsFromHeaders(['Full Name', 'Active']);
    const rows = normalizeRowsFromMatrix(
      [['Ana', true], ['Luis', { code: 7 }], ['Mia', null]],
      columns,
    );

    expect(columns).toEqual([
      { key: 'col-full-name-1', label: 'Full Name', align: 'left', sortable: false },
      { key: 'col-active-2', label: 'Active', align: 'left', sortable: false },
    ]);
    expect(rows).toEqual([
      { 'col-full-name-1': 'Ana', 'col-active-2': true },
      { 'col-full-name-1': 'Luis', 'col-active-2': '{"code":7}' },
      { 'col-full-name-1': 'Mia', 'col-active-2': '' },
    ]);
  });

  it('should discard malformed columns during sanitization', () => {
    const config = sanitizeDataTableConfig({
      columns: [
        { key: 'status', label: 'Status', align: 'center', sortable: true },
        { key: '', label: 'Broken' },
        { label: 'Missing key' },
      ],
    });

    expect(normalizeColumns(config.columns)).toEqual([
      { key: 'status', label: 'Status', align: 'center', sortable: true },
    ]);
  });

  it('should sanitize booleans and empty label from config', () => {
    const config = sanitizeDataTableConfig({
      emptyLabel: '  No rows  ',
      striped: true,
      bordered: false,
      hoverable: true,
      compact: false,
    });

    expect(config.emptyLabel).toBe('No rows');
    expect(config.striped).toBe(true);
    expect(config.bordered).toBe(false);
    expect(config.hoverable).toBe(true);
    expect(config.compact).toBe(false);
  });
});
