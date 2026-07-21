import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, HostListener, inject, input, output } from '@angular/core';
import { FocusManagerService } from '../services/focus-manager.service';

@Directive({
  selector: '[synFocusOut]',
  standalone: true,
})
export class FocusOutDirective {
  readonly #document = inject(DOCUMENT);
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #focusManager = inject(FocusManagerService);

  readonly active = input(true);
  readonly focusOutside = output<void>();

  @HostListener('focusout')
  onFocusOut(): void {
    if (!this.active()) {
      return;
    }

    queueMicrotask(() => {
      const activeElement = this.#document.activeElement;
      if (!this.#focusManager.contains(this.#elementRef.nativeElement, activeElement)) {
        this.focusOutside.emit();
      }
    });
  }
}
