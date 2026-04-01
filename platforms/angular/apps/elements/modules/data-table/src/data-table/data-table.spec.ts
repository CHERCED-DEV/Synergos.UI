import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataTableElementComponent } from './data-table';

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
});
