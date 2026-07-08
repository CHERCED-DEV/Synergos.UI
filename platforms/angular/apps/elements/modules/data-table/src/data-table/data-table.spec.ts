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

  it('should sanitize empty action fields from config', () => {
    const config = sanitizeDataTableConfig({
      emptyActionLabel: '  Add record  ',
      emptyActionHref: '  /records/new  ',
    });

    expect(config.emptyActionLabel).toBe('Add record');
    expect(config.emptyActionHref).toBe('/records/new');
  });

  it('should expose an accessible heading in the empty state', async () => {
    fixture.componentRef.setInput('emptyLabel', 'No records yet');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const heading: HTMLElement | null = fixture.nativeElement.querySelector('.data-table__empty-title');
    expect(heading).toBeTruthy();
    expect(heading?.getAttribute('role')).toBe('heading');
    expect(heading?.getAttribute('aria-level')).toBe('3');
    expect(heading?.textContent?.trim()).toBe('No records yet');
  });

  it('should render a CTA button that emits emptyAction when no href is set', async () => {
    fixture.componentRef.setInput('emptyActionLabel', 'Create record');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.data-table__empty-action');
    expect(button).toBeTruthy();
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.textContent?.trim()).toBe('Create record');

    let emitted = 0;
    component.emptyAction.subscribe(() => (emitted += 1));
    button?.click();
    expect(emitted).toBe(1);
  });

  it('should render an anchor CTA when emptyActionHref is provided', async () => {
    fixture.componentRef.setInput('emptyActionLabel', 'Import data');
    fixture.componentRef.setInput('emptyActionHref', '/import');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.data-table__empty-action');
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('href')).toBe('/import');
    expect(link?.textContent?.trim()).toBe('Import data');
  });

  it('should not render a CTA when emptyActionLabel is absent', () => {
    const action: HTMLElement | null = fixture.nativeElement.querySelector('.data-table__empty-action');
    expect(action).toBeNull();
  });
});
