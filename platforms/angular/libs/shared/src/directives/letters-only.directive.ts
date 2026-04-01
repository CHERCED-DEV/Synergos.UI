import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

@Directive({
  selector: '[synLettersOnly]',
  standalone: true,
})
export class LettersOnlyDirective {
  readonly #elementRef = inject(ElementRef<HTMLInputElement>);

  readonly enabled = input(true);
  readonly pattern = input(`^[\\p{L}\\s'\\-]*$`);

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.enabled() || this.isSpecialKey(event)) {
      return;
    }

    const currentValue = this.#elementRef.nativeElement.value;
    const start = this.#elementRef.nativeElement.selectionStart ?? currentValue.length;
    const end = this.#elementRef.nativeElement.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${event.key}${currentValue.slice(end)}`;
    const matcher = new RegExp(this.pattern(), 'u');

    if (!matcher.test(nextValue)) {
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
}
