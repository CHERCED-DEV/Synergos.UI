import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';
import { FocusManagerService } from '../services/focus-manager.service';

@Directive({
  selector: '[synClickOutside]',
  standalone: true,
})
export class ClickOutsideDirective implements OnInit, OnDestroy {
  readonly #document = inject(DOCUMENT);
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #focusManager = inject(FocusManagerService);

  readonly active = input(true);
  readonly clickedOutside = output<MouseEvent | TouchEvent>();

  ngOnInit(): void {
    this.#document.addEventListener('click', this.onDocumentClick, true);
    this.#document.addEventListener('touchstart', this.onDocumentTouchStart, true);
  }

  ngOnDestroy(): void {
    this.#document.removeEventListener('click', this.onDocumentClick, true);
    this.#document.removeEventListener('touchstart', this.onDocumentTouchStart, true);
  }

  readonly onDocumentClick = (event: MouseEvent): void => {
    this.emitIfOutside(event);
  };

  readonly onDocumentTouchStart = (event: TouchEvent): void => {
    this.emitIfOutside(event);
  };

  private emitIfOutside(event: MouseEvent | TouchEvent): void {
    if (!this.active()) {
      return;
    }

    if (this.#focusManager.contains(this.#elementRef.nativeElement, event.target)) {
      return;
    }

    this.clickedOutside.emit(event);
  }
}
