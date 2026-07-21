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

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'syn-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-dropdown">
      <button
        type="button"
        class="syn-dropdown__trigger"
        [disabled]="disabled()"
        aria-haspopup="menu"
        [attr.aria-expanded]="isOpen()"
        [attr.aria-label]="ariaLabel() || label()"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        {{ label() }}
      </button>

      @if (isOpen()) {
        <ul
          class="syn-dropdown__menu"
          role="menu"
          tabindex="-1"
          (keydown)="onMenuKeydown($event)"
        >
          @for (item of items(); track item.id; let i = $index) {
            <li role="none">
              <button
                class="syn-dropdown__item"
                role="menuitem"
                type="button"
                [disabled]="item.disabled ?? false"
                [attr.tabindex]="activeIndex() === i ? 0 : -1"
                (click)="onSelect(item.id, i)"
              >
                {{ item.label }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styleUrl: './dropdown.scss',
})
export class DropdownComponent {
  readonly #host = inject(ElementRef<HTMLElement>);

  readonly label = input('Actions');
  readonly ariaLabel = input('');
  readonly disabled = input(false);
  readonly items = input<readonly DropdownItem[]>([]);

  readonly isOpen = signal(false);
  readonly activeIndex = signal(0);

  readonly itemSelected = output<string>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!this.#host.nativeElement.contains(target)) {
      this.close();
    }
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }

    if (this.isOpen()) {
      this.close();
      return;
    }

    this.open();
  }

  open(): void {
    this.isOpen.set(true);
    this.activeIndex.set(this.findNextEnabledIndex(-1, 1));
    queueMicrotask(() => this.focusItem(this.activeIndex()));
  }

  close(): void {
    this.isOpen.set(false);
  }

  onSelect(id: string, index: number): void {
    const item = this.items()[index];
    if (!item || item.disabled) {
      return;
    }

    this.itemSelected.emit(id);
    this.close();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    this.open();
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      return;
    }

    const current = this.activeIndex();

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(this.findNextEnabledIndex(current, 1));
      this.focusItem(this.activeIndex());
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(this.findNextEnabledIndex(current, -1));
      this.focusItem(this.activeIndex());
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      this.activeIndex.set(this.findNextEnabledIndex(-1, 1));
      this.focusItem(this.activeIndex());
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.activeIndex.set(this.findNextEnabledIndex(0, -1));
      this.focusItem(this.activeIndex());
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const index = this.activeIndex();
      const item = this.items()[index];
      if (!item || item.disabled) {
        return;
      }

      this.itemSelected.emit(item.id);
      this.close();
    }
  }

  private findNextEnabledIndex(start: number, direction: 1 | -1): number {
    const menuItems = this.items();
    if (menuItems.length === 0) {
      return 0;
    }

    let index = start;

    for (let step = 0; step < menuItems.length; step += 1) {
      index = (index + direction + menuItems.length) % menuItems.length;
      if (!menuItems[index]?.disabled) {
        return index;
      }
    }

    return 0;
  }

  private focusItem(index: number): void {
    const hostElement = this.#host.nativeElement as HTMLElement;
    const nodes = hostElement.querySelectorAll('.syn-dropdown__item');
    const target = nodes.item(index);
    if (target instanceof HTMLButtonElement) {
      target.focus();
    }
  }
}
