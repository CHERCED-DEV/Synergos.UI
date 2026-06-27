import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectMultiElementComponent, type SelectMultiChangeDetail } from './select-multi';

const OPTIONS = JSON.stringify([
  { value: 'co', label: 'Colombia' },
  { value: 'mx', label: 'México' },
  { value: 'ar', label: 'Argentina' },
  { value: 'pe', label: 'Perú', disabled: true },
]);

describe('SelectMultiElementComponent', () => {
  let fixture: ComponentFixture<SelectMultiElementComponent>;
  let component: SelectMultiElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectMultiElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectMultiElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no options and no selection (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.options()).toEqual([]);
    expect(component.selectedValues()).toEqual([]);
    expect(component.hasSelection()).toBe(false);
    expect(component.filteredOptions()).toEqual([]);
  });

  it('should render normalized options and resolve label from config (render + config)', async () => {
    fixture.componentRef.setInput('label', 'País');
    fixture.componentRef.setInput('optionsJson', OPTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('País');
    expect(component.hasLabel()).toBe(true);
    const options = component.options();
    expect(options.length).toBe(4);
    expect(options[0]).toEqual({ value: 'co', label: 'Colombia', disabled: false });
    expect(options[3].disabled).toBe(true);
  });

  it('should toggle a selection, emit, filter by query, and honor max + disabled (interaction)', async () => {
    const emitted: SelectMultiChangeDetail[] = [];
    component.selectionchange.subscribe((detail) => emitted.push(detail));

    fixture.componentRef.setInput('optionsJson', OPTIONS);
    fixture.componentRef.setInput('maxSelections', 2);
    fixture.detectChanges();
    await fixture.whenStable();

    // Accent-insensitive search.
    component.onQueryInput('mexico');
    expect(component.filteredOptions().map((o) => o.value)).toEqual(['mx']);

    component.toggleOption(component.options()[0]); // co
    component.toggleOption(component.options()[1]); // mx
    expect(component.selectedValues()).toEqual(['co', 'mx']);
    expect(emitted.at(-1)?.values).toEqual(['co', 'mx']);

    // Cap reached: a third pick is blocked.
    expect(component.atCapacity()).toBe(true);
    component.toggleOption(component.options()[2]); // ar — blocked
    expect(component.selectedValues()).toEqual(['co', 'mx']);

    // Disabled option never selects.
    component.toggleOption(component.options()[3]); // pe disabled
    expect(component.selectedValues()).toEqual(['co', 'mx']);

    // Removing a chip frees capacity.
    component.removeOption(component.options()[0]);
    expect(component.selectedValues()).toEqual(['mx']);
    expect(component.atCapacity()).toBe(false);
  });

  it('should be idempotent: re-toggling and direct input precedence (idempotent)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config label","options":[{"value":"x","label":"X"}]}');
    fixture.componentRef.setInput('label', 'Input label');
    fixture.componentRef.setInput('optionsJson', OPTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config.
    expect(component.label()).toBe('Input label');
    expect(component.options().length).toBe(4);

    const option = component.options()[1]; // mx
    component.toggleOption(option); // select
    component.toggleOption(option); // deselect -> back to empty
    expect(component.selectedValues()).toEqual([]);

    // Selecting the same value twice does not duplicate.
    component.toggleOption(option);
    component.toggleOption(option);
    component.toggleOption(option);
    expect(component.selectedValues()).toEqual(['mx']);
  });
});
