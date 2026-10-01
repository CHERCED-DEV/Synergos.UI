import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SELECT_MULTI_SYNHOST } from '@synergos/contracts';
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

  // D1: con `optionsJson` —el TEXTO que mandaba la vista— este elemento no encontraba opciones.
  // Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta las opciones que autoró el editor con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = SELECT_MULTI_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe(ejemplo.label);
    expect(component.options().map((o) => o.value)).toEqual(ejemplo.options?.map((o) => o.value));
    expect(component.options().map((o) => o.label)).toEqual(ejemplo.options?.map((o) => o.label));
    expect(component.maxSelections()).toBe(ejemplo.maxSelections);
    const filas = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="option"]');
    expect(filas.length).toBe(ejemplo.options?.length);
  });

  it('should toggle a selection, emit, filter by query, and honor max + disabled (interaction)', async () => {
    const emitted: SelectMultiChangeDetail[] = [];
    component.valueschange.subscribe((detail) => emitted.push(detail));

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

  // ADR 0136 (CMS#191): la microcopia sale de `SelectMulti` y `Common.States` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO, con el plural bien escrito', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(SELECT_MULTI_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      component.toggleOption(component.options()[0]);
      fixture.detectChanges();
      expect(component.selectedSummary()).toBe('1 opción seleccionada.');
      expect(component.capacityHint()).toBe('1 / 2 seleccionadas');
      component.toggleOption(component.options()[1]);
      expect(component.selectedSummary()).toBe('2 opciones seleccionadas.');
      expect(component.removeLabel('Piscina')).toBe('Quitar Piscina');
      expect(component.placeholder()).toBe('Buscar opciones…');
      expect(component.emptyLabel()).toBe('Sin resultados.');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: {
            'SelectMulti.Clear': 'Clear',
            'SelectMulti.Selected.Other': '{count} options selected.',
            'Common.States.NoResults': 'No results found.',
          },
        },
      };
      const otra = TestBed.createComponent(SelectMultiElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(SELECT_MULTI_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();

      const c = otra.componentInstance;
      c.toggleOption(c.options()[0]);
      c.toggleOption(c.options()[1]);
      otra.detectChanges();
      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.select-multi__clear')?.textContent?.trim()).toBe('Clear');
      expect(raiz.querySelector('.select-multi__sr')?.textContent?.trim()).toBe('2 options selected.');
      expect(c.emptyLabel()).toBe('No results found.');
      expect(c.removeLabel('Piscina')).toBe('Quitar Piscina');
    });
  });
});
