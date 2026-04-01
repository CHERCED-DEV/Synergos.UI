import { AfterViewInit, Directive, ElementRef, inject, input, output } from '@angular/core';

@Directive({
  selector: '[synScrollIntoView]',
  standalone: true,
})
export class ScrollIntoViewDirective implements AfterViewInit {
  readonly #elementRef = inject(ElementRef<HTMLElement>);

  readonly enabled = input(true);
  readonly delayMs = input(0);
  readonly block = input<ScrollLogicalPosition>('nearest');
  readonly didScroll = output<void>();

  ngAfterViewInit(): void {
    if (!this.enabled()) {
      return;
    }

    setTimeout(() => {
      const bounds = this.#elementRef.nativeElement.getBoundingClientRect();
      const isOutOfViewport = bounds.top < 0 || bounds.bottom > window.innerHeight;
      if (!isOutOfViewport) {
        return;
      }

      this.#elementRef.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: this.block(),
      });
      this.didScroll.emit();
    }, this.delayMs());
  }
}
