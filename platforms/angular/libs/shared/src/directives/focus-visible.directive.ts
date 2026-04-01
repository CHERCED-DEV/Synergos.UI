import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, OnDestroy, OnInit, inject, output, signal } from '@angular/core';

@Directive({
  selector: '[synFocusVisible]',
  standalone: true,
  host: {
    '[class.syn-focus-visible]': 'isFocusVisible()',
  },
})
export class FocusVisibleDirective implements OnInit, OnDestroy {
  readonly #document = inject(DOCUMENT);
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #isFocusVisible = signal(false);

  #hadKeyboardEvent = false;

  readonly isFocusVisible = this.#isFocusVisible.asReadonly();
  readonly focusVisibleChange = output<boolean>();

  ngOnInit(): void {
    this.#document.addEventListener('keydown', this.onDocumentKeydown, true);
    this.#document.addEventListener('mousedown', this.onDocumentMousedown, true);
    this.#elementRef.nativeElement.addEventListener('focus', this.onFocus);
    this.#elementRef.nativeElement.addEventListener('blur', this.onBlur);
  }

  ngOnDestroy(): void {
    this.#document.removeEventListener('keydown', this.onDocumentKeydown, true);
    this.#document.removeEventListener('mousedown', this.onDocumentMousedown, true);
    this.#elementRef.nativeElement.removeEventListener('focus', this.onFocus);
    this.#elementRef.nativeElement.removeEventListener('blur', this.onBlur);
  }

  readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') {
      this.#hadKeyboardEvent = true;
    }
  };

  readonly onDocumentMousedown = (): void => {
    this.#hadKeyboardEvent = false;
  };

  readonly onFocus = (): void => {
    if (!this.#hadKeyboardEvent) {
      return;
    }

    this.#isFocusVisible.set(true);
    this.focusVisibleChange.emit(true);
  };

  readonly onBlur = (): void => {
    this.#isFocusVisible.set(false);
    this.focusVisibleChange.emit(false);
  };
}
