import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutocompleteElementComponent,
  type AutocompleteSelectDetail,
  normalizeSuggestions,
} from './autocomplete';

const SUGGESTIONS = JSON.stringify([
  'Bogotá',
  'Medellín',
  { label: 'Cali', value: 'cali' },
  { value: 'cartagena' },
  { label: 'Bogotá' },
  '',
  42,
]);

/** Type a value through the input handler, then flush the debounce + effects. */
function typeQuery(
  fixture: ComponentFixture<AutocompleteElementComponent>,
  component: AutocompleteElementComponent,
  value: string,
): void {
  component.onInput({ target: { value } } as unknown as Event);
  fixture.detectChanges();
  vi.advanceTimersByTime(component.debounceMs() + 1);
  fixture.detectChanges();
}

describe('AutocompleteElementComponent', () => {
  let fixture: ComponentFixture<AutocompleteElementComponent>;
  let component: AutocompleteElementComponent;

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [AutocompleteElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AutocompleteElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should create and surface no suggestions before the visitor types (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.query()).toBe('');
    expect(component.open()).toBe(false);
    expect(component.suggestions().length).toBe(0);
    expect(component.hasSuggestions()).toBe(false);
    expect(component.activeOptionId()).toBeNull();
    // Sensible defaults when nothing is configured.
    expect(component.placeholder()).toBe('Buscar…');
    expect(component.debounceMs()).toBe(200);
    expect(component.minChars()).toBe(1);
    expect(fixture.nativeElement.querySelector('.autocomplete__listbox').hidden).toBe(true);
  });

  it('should render config (label/placeholder) and filter inline suggestions by debounced query (render/config case)', () => {
    fixture.componentRef.setInput('label', 'Ciudad');
    fixture.componentRef.setInput('placeholder', 'Escribe una ciudad');
    fixture.componentRef.setInput('suggestions', SUGGESTIONS);
    fixture.detectChanges();

    expect(component.label()).toBe('Ciudad');
    expect(component.placeholder()).toBe('Escribe una ciudad');
    const labelEl = fixture.nativeElement.querySelector('.autocomplete__label');
    expect(labelEl?.textContent?.trim()).toBe('Ciudad');

    // 5 unique valid suggestions survive normalization (Bogotá, Medellín, Cali,
    // cartagena value-only, 42->"42"; duplicate Bogotá deduped, empty dropped).
    expect(component.inlineSuggestions().length).toBe(5);

    typeQuery(fixture, component, 'bog');

    expect(component.open()).toBe(true);
    expect(component.suggestions().length).toBe(1);
    expect(component.suggestions()[0].label).toBe('Bogotá');
    expect(component.expanded()).toBe(true);
    expect(fixture.nativeElement.querySelector('.autocomplete__listbox').hidden).toBe(false);
  });

  it('should navigate with the keyboard and emit suggestionselect on Enter (interaction case)', () => {
    fixture.componentRef.setInput('suggestions', SUGGESTIONS);
    fixture.detectChanges();

    typeQuery(fixture, component, 'a');
    expect(component.suggestions().length).toBeGreaterThan(0);

    let emitted: AutocompleteSelectDetail | undefined;
    component.suggestionselect.subscribe((detail) => (emitted = detail));

    // ArrowDown activates the first option; aria-activedescendant tracks it.
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeIndex()).toBe(0);
    expect(component.activeOptionId()).toBe(component.optionId(0));

    // ArrowUp from the top wraps to the last option (roving).
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.activeIndex()).toBe(component.suggestions().length - 1);

    // Home jumps back to the first; Enter selects it.
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(component.activeIndex()).toBe(0);

    const expected = component.suggestions()[0];
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(emitted).toBeDefined();
    expect(emitted?.label).toBe(expected.label);
    expect(emitted?.value).toBe(expected.value);
    // Selecting commits the label and closes the popup.
    expect(component.query()).toBe(expected.label);
    expect(component.open()).toBe(false);
    expect(component.activeIndex()).toBe(-1);
  });

  it('should let direct inputs override config and stay idempotent across repeats (idempotent/precedence case)', () => {
    fixture.componentRef.setInput(
      'config',
      '{"placeholder":"desde config","minChars":3,"maxSuggestions":2}',
    );
    fixture.componentRef.setInput('placeholder', 'desde atributo');
    fixture.componentRef.setInput('minChars', '2');
    fixture.detectChanges();

    // Explicit attribute wins over config; config wins over default.
    expect(component.placeholder()).toBe('desde atributo');
    expect(component.minChars()).toBe(2);
    expect(component.maxSuggestions()).toBe(2);

    // Closing then Escape then closing again leaves the same closed state.
    component.close();
    const snapshot = { open: component.open(), active: component.activeIndex() };
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    component.close();
    expect(component.open()).toBe(snapshot.open);
    expect(component.activeIndex()).toBe(snapshot.active);
  });

  it('should respect minChars before producing suggestions', () => {
    fixture.componentRef.setInput('suggestions', SUGGESTIONS);
    fixture.componentRef.setInput('minChars', '3');
    fixture.detectChanges();

    typeQuery(fixture, component, 'bo');
    expect(component.suggestions().length).toBe(0);

    typeQuery(fixture, component, 'bog');
    expect(component.suggestions().length).toBe(1);
  });
});

describe('autocomplete pure helpers', () => {
  it('normalizeSuggestions coerces strings/records, drops empties, dedupes', () => {
    const result = normalizeSuggestions([
      'Alpha',
      { label: 'Beta', value: 'b' },
      { value: 'gamma-only' },
      { label: 'Alpha' },
      '',
      null,
      99,
    ]);

    // Contract: the dedupe key is `label::value` AFTER coercion. The 4th entry
    // ({ label: 'Alpha' }, whose missing value falls back to the label) is
    // therefore byte-identical to the 1st and is dropped; '' and null carry no
    // label and are dropped too. 7 in -> 4 out.
    //
    // This spec asserted 5 and expected the duplicate Alpha back at index 3:
    // it applied the drop-empties rule but not the dedupe rule named in its own
    // title. The good contract is the one the component-level spec above already
    // documents and verifies ("duplicate Bogotá deduped, empty dropped", 7 in ->
    // 5 out) — rendering the same label+value twice would give the listbox two
    // indistinguishable rows and two indistinguishable roving stops.
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ label: 'Alpha', value: 'Alpha' });
    expect(result[1]).toEqual({ label: 'Beta', value: 'b' });
    expect(result[2]).toEqual({ label: 'gamma-only', value: 'gamma-only' });
    expect(result[3]).toEqual({ label: '99', value: '99' });
    expect(result.filter((suggestion) => suggestion.label === 'Alpha').length).toBe(1);
  });

  it('normalizeSuggestions keeps same-label suggestions that carry distinct values', () => {
    // The dedupe must stay conservative: label and value together form the key,
    // so two options a visitor can actually tell apart both survive.
    const result = normalizeSuggestions([
      { label: 'Santiago', value: 'santiago-cl' },
      { label: 'Santiago', value: 'santiago-do' },
    ]);

    expect(result.length).toBe(2);
    expect(result.map((suggestion) => suggestion.value)).toEqual([
      'santiago-cl',
      'santiago-do',
    ]);
  });

  it('normalizeSuggestions returns [] for non-array input', () => {
    expect(normalizeSuggestions(undefined).length).toBe(0);
    expect(normalizeSuggestions('not-an-array').length).toBe(0);
    expect(normalizeSuggestions({ label: 'x' }).length).toBe(0);
  });
});
