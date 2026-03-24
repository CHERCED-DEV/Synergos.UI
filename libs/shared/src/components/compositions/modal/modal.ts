import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

let modalId = 0;

@Component({
  selector: 'syn-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="syn-modal__trigger" (click)="open()">
      {{ triggerLabel() }}
    </button>

    @if (isOpen()) {
      <div class="syn-modal" role="presentation">
        <button
          type="button"
          class="syn-modal__backdrop"
          aria-label="Close dialog"
          (click)="close()"
        ></button>

        <section
          class="syn-modal__panel"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          [attr.aria-describedby]="description() ? descriptionId : null"
        >
          <header class="syn-modal__header">
            <h2 class="syn-modal__title" [id]="titleId">{{ title() }}</h2>
            <button
              type="button"
              class="syn-modal__close"
              [attr.aria-label]="closeLabel()"
              (click)="close()"
            >
              x
            </button>
          </header>

          @if (description()) {
            <p class="syn-modal__description" [id]="descriptionId">{{ description() }}</p>
          }

          <div class="syn-modal__content">
            <ng-content />
          </div>
        </section>
      </div>
    }
  `,
  styleUrl: './modal.scss',
})
export class ModalComponent {
  readonly #host = inject(ElementRef<HTMLElement>);

  readonly title = input('Dialog');
  readonly description = input('');
  readonly triggerLabel = input('Open dialog');
  readonly closeLabel = input('Close dialog');

  readonly isOpen = signal(false);

  readonly opened = output<void>();
  readonly closed = output<void>();

  readonly titleId = `syn-modal-title-${modalId}`;
  readonly descriptionId = `syn-modal-description-${modalId}`;

  constructor() {
    modalId += 1;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen()) {
      event.preventDefault();
      this.close();
    }
  }

  open(): void {
    this.isOpen.set(true);
    this.opened.emit();
    queueMicrotask(() => this.focusCloseButton());
  }

  close(): void {
    this.isOpen.set(false);
    this.closed.emit();
  }

  private focusCloseButton(): void {
    const hostElement = this.#host.nativeElement as HTMLElement;
    const closeButton = hostElement.querySelector('.syn-modal__close');
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.focus();
    }
  }
}
