import { TestBed } from '@angular/core/testing';
import { IconButtonComponent } from './icon-button';

describe(IconButtonComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconButtonComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(IconButtonComponent);
    fixture.componentRef.setInput('icon', 'x');
    fixture.componentRef.setInput('ariaLabel', 'Close dialog');
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits pressed on click', () => {
    const fixture = TestBed.createComponent(IconButtonComponent);
    fixture.componentRef.setInput('icon', 'x');
    fixture.componentRef.setInput('ariaLabel', 'Close dialog');

    const pressed = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(pressed).toHaveBeenCalledTimes(1);
  });

  // 014-despiece-tienda (T003): el icono del set y el estado de alternancia.
  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(IconButtonComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  }

  it('paints a name of the icon set as its SVG, never as the word', () => {
    const button = render({ icon: 'heart', ariaLabel: 'Agregar a favoritos' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent?.trim()).toBe('');
  });

  it('keeps painting any other text as a glyph', () => {
    const button = render({ icon: '×', ariaLabel: 'Cerrar' });
    expect(button.querySelector('svg')).toBeNull();
    expect(button.textContent?.trim()).toBe('×');
  });

  it('announces a toggle only when it is one', () => {
    expect(render({ icon: 'heart', ariaLabel: 'Favorito' }).hasAttribute('aria-pressed')).toBe(false);
    const on = render({ icon: 'heart', ariaLabel: 'Favorito', selected: true });
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.classList.contains('syn-icon-button--selected')).toBe(true);
  });
});