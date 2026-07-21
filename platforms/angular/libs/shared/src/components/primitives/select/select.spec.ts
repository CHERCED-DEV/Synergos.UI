import { TestBed } from '@angular/core/testing';
import { SelectComponent } from './select';

describe(SelectComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('options', [{ value: 'a', label: 'A' }]);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits selected value', () => {
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);

    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change'));

    expect(changed).toHaveBeenCalledWith('b');
  });

  it('applies invalid state and renders hint content', () => {
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('options', [{ value: 'a', label: 'A' }]);
    fixture.componentRef.setInput('hint', 'Pick one');
    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    const wrapper = fixture.nativeElement.querySelector('.syn-select') as HTMLDivElement;
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    const hint = fixture.nativeElement.querySelector('.syn-select__hint') as HTMLParagraphElement;

    expect(wrapper.className).toContain('syn-select--error');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toContain(hint.id);
    expect(hint.textContent).toContain('Pick one');
  });

  describe('autocomplete', () => {
    function renderSelect(props: Record<string, unknown>): HTMLSelectElement {
      const fixture = TestBed.createComponent(SelectComponent);
      fixture.componentRef.setInput('options', [{ value: 'a', label: 'A' }]);
      for (const [key, value] of Object.entries(props)) {
        fixture.componentRef.setInput(key, value);
      }
      fixture.detectChanges();

      return fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    }

    it('omits the attribute by default', () => {
      expect(renderSelect({}).hasAttribute('autocomplete')).toBe(false);
    });

    it('emits country-name for a country dropdown', () => {
      expect(renderSelect({ autocomplete: 'country-name' }).getAttribute('autocomplete')).toBe(
        'country-name',
      );
    });

    it('emits address-level1 for a departamento dropdown', () => {
      expect(renderSelect({ autocomplete: 'address-level1' }).getAttribute('autocomplete')).toBe(
        'address-level1',
      );
    });

    it('treats a blank autocomplete as absent', () => {
      expect(renderSelect({ autocomplete: '   ' }).hasAttribute('autocomplete')).toBe(false);
    });

    it('never emits inputmode — a select accepts no typed text', () => {
      expect(renderSelect({ autocomplete: 'country-name' }).hasAttribute('inputmode')).toBe(false);
    });
  });
});
