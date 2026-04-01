import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

@Directive({
  selector: '[synNumberOnly]',
  standalone: true,
})
export class NumberOnlyDirective {
  readonly #elementRef = inject(ElementRef<HTMLInputElement>);

  readonly enabled = input(true);
  readonly allowDecimal = input(false);
  readonly allowNegative = input(false);

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.enabled() || this.isSpecialKey(event)) {
      return;
    }

    const currentValue = this.#elementRef.nativeElement.value;
    const nextValue = this.buildNextValue(currentValue, event.key);

    if (!this.isValidValue(nextValue)) {
      event.preventDefault();
    }
  }

  private isSpecialKey(event: KeyboardEvent): boolean {
    return [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(event.key);
  }

  private buildNextValue(currentValue: string, key: string): string {
    const start = this.#elementRef.nativeElement.selectionStart ?? currentValue.length;
    const end = this.#elementRef.nativeElement.selectionEnd ?? currentValue.length;
    return `${currentValue.slice(0, start)}${key}${currentValue.slice(end)}`;
  }

  private isValidValue(value: string): boolean {
    const sign = this.allowNegative() ? '-?' : '';
    const decimals = this.allowDecimal() ? '(?:\\.\\d*)?' : '';
    const pattern = new RegExp(`^${sign}\\d*${decimals}$`);
    return pattern.test(value);
  }
}
