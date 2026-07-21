import { TestBed } from '@angular/core/testing';
import { InputComponent } from './input';

describe(InputComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(InputComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits value changes', () => {
    const fixture = TestBed.createComponent(InputComponent);
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Synergos';
    input.dispatchEvent(new Event('input'));

    expect(changed).toHaveBeenCalledWith('Synergos');
  });

  function renderInput(props: Record<string, unknown>): HTMLInputElement {
    const fixture = TestBed.createComponent(InputComponent);
    for (const [key, value] of Object.entries(props)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();

    return fixture.nativeElement.querySelector('input') as HTMLInputElement;
  }

  describe('inputmode', () => {
    it('omits the attribute entirely for a plain text field', () => {
      const input = renderInput({ type: 'text' });

      expect(input.hasAttribute('inputmode')).toBe(false);
    });

    it('omits the attribute for a password field', () => {
      const input = renderInput({ type: 'password' });

      expect(input.hasAttribute('inputmode')).toBe(false);
    });

    it.each([
      ['email', 'email'],
      ['tel', 'tel'],
      ['url', 'url'],
      ['search', 'search'],
    ])('infers inputmode=%s from type=%s', (type, expected) => {
      expect(renderInput({ type }).getAttribute('inputmode')).toBe(expected);
    });

    it('infers decimal (not numeric) from type=number so es-CO prices stay typable', () => {
      const input = renderInput({ type: 'number' });

      expect(input.getAttribute('inputmode')).toBe('decimal');
    });

    it('lets an explicit inputMode beat the value inferred from type', () => {
      const input = renderInput({ type: 'number', inputMode: 'numeric' });

      expect(input.getAttribute('inputmode')).toBe('numeric');
    });

    it('falls back to the inferred value when the explicit inputMode is not a valid token', () => {
      const input = renderInput({ type: 'email', inputMode: 'banana' });

      expect(input.getAttribute('inputmode')).toBe('email');
    });

    it('normalises casing and padding on an explicit inputMode', () => {
      const input = renderInput({ type: 'text', inputMode: '  NUMERIC  ' });

      expect(input.getAttribute('inputmode')).toBe('numeric');
    });
  });

  describe('autocomplete', () => {
    it('omits the attribute by default rather than guessing', () => {
      const input = renderInput({ type: 'text' });

      expect(input.hasAttribute('autocomplete')).toBe(false);
    });

    it('never infers autocomplete from type=email — the field may hold someone else data', () => {
      const input = renderInput({ type: 'email' });

      expect(input.hasAttribute('autocomplete')).toBe(false);
    });

    it('never infers autocomplete from type=password', () => {
      const input = renderInput({ type: 'password' });

      expect(input.hasAttribute('autocomplete')).toBe(false);
    });

    it('emits the token the consumer passes', () => {
      const input = renderInput({ type: 'email', autocomplete: 'email' });

      expect(input.getAttribute('autocomplete')).toBe('email');
    });

    it('supports multi-token values such as "shipping street-address"', () => {
      const input = renderInput({ autocomplete: 'shipping street-address' });

      expect(input.getAttribute('autocomplete')).toBe('shipping street-address');
    });

    it('treats a blank autocomplete as absent instead of emitting an empty attribute', () => {
      const input = renderInput({ autocomplete: '   ' });

      expect(input.hasAttribute('autocomplete')).toBe(false);
    });
  });
});