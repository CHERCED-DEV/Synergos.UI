import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DropdownElementComponent,
  type DropdownSelectDetail,
  normalizeItems,
} from './dropdown';

const ITEMS = JSON.stringify([
  { value: 'edit', label: 'Editar' },
  { value: 'dup', label: 'Duplicar', href: '/dup' },
  { value: 'archive', label: 'Archivar', disabled: true },
  { value: 'del', label: 'Eliminar' },
  { label: '   ' }, // sin label útil — descartado
]);

describe('DropdownElementComponent', () => {
  let fixture: ComponentFixture<DropdownElementComponent>;
  let component: DropdownElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropdownElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DropdownElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no items closed and a default trigger label (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasItems()).toBe(false);
    expect(component.open()).toBe(false);
    expect(component.triggerText()).toBe('Opciones');
    // Opening with no items is a no-op.
    component.openMenu();
    expect(component.open()).toBe(false);
  });

  it('should normalize items and honor triggerLabel + selectedValue (render/config case)', async () => {
    fixture.componentRef.setInput('triggerLabel', 'Acciones');
    fixture.componentRef.setInput('optionsJson', ITEMS);
    fixture.componentRef.setInput('selectedValue', 'dup');
    fixture.detectChanges();
    await fixture.whenStable();

    // 4 valid items survive (the blank-label entry is dropped).
    expect(component.items().length).toBe(4);
    expect(component.hasItems()).toBe(true);
    // Selected item drives the trigger summary.
    expect(component.selectedValue()).toBe('dup');
    expect(component.triggerText()).toBe('Duplicar');
    // The archive item is disabled and never becomes the roving target.
    expect(component.activeValue()).not.toBe('archive');
  });

  it('should open, select an enabled item, emit select, and close (interaction case)', async () => {
    fixture.componentRef.setInput('optionsJson', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: DropdownSelectDetail | undefined;
    component.itemselect.subscribe((detail) => (emitted = detail));

    component.openMenu();
    expect(component.open()).toBe(true);

    const del = component.items().find((item) => item.value === 'del');
    expect(del).toBeDefined();
    component.selectItem(del!);

    expect(emitted?.value).toBe('del');
    expect(emitted?.label).toBe('Eliminar');
    expect(component.selectedValue()).toBe('del');
    expect(component.isSelected(del!)).toBe(true);
    // Selecting closes the menu.
    expect(component.open()).toBe(false);

    // Selecting a disabled item is ignored (idempotent on state).
    const archive = component.items().find((item) => item.value === 'archive');
    component.selectItem(archive!);
    expect(component.selectedValue()).toBe('del');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"triggerLabel":"Desde config","searchable":false}',
    );
    fixture.componentRef.setInput('triggerLabel', 'Desde atributo');
    fixture.componentRef.setInput('searchable', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.triggerLabel()).toBe('Desde atributo');
    expect(component.searchable()).toBe(true);
  });

  it('should filter visible items by query when searchable', async () => {
    fixture.componentRef.setInput('optionsJson', ITEMS);
    fixture.componentRef.setInput('searchable', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    component.openMenu();
    component.query.set('arch');
    expect(component.visibleItems().length).toBe(1);
    expect(component.visibleItems()[0].value).toBe('archive');

    component.query.set('');
    expect(component.visibleItems().length).toBe(4);
  });
});

describe('dropdown pure helpers', () => {
  it('normalizeItems coerces strings and objects, drops empties, dedupes values', () => {
    const items = normalizeItems([
      'Plano',
      { value: 'a', label: 'Alpha' },
      { label: 'Beta' },
      { value: 'a', label: 'Alpha dup' },
      { },
      42,
    ]);

    expect(items.length).toBe(4);
    expect(items[0]).toEqual({ value: 'Plano', label: 'Plano', href: '', disabled: false });
    expect(items[1].value).toBe('a');
    // Beta has no explicit value — falls back to its label.
    expect(items[2].value).toBe('Beta');
    // Duplicate "a" gets a suffixed value to stay unique.
    expect(items[3].value).not.toBe('a');
  });

  it('normalizeItems marks disabled items', () => {
    const items = normalizeItems([{ value: 'x', label: 'X', disabled: true }]);
    expect(items[0].disabled).toBe(true);
  });
});
