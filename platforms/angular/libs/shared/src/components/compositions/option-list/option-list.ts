import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { IconComponent } from '../../primitives/icon/icon';
import { classNames } from '../../../utils/class-names.util';

export type OptionListLayout = 'list' | 'cards';
export type OptionSelectionMode = 'single' | 'multiple';

export interface OptionListItem {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly iconSymbol?: string;
  readonly imageSrc?: string;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly value?: unknown;
}

@Component({
  selector: 'syn-option-list',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul
      class="syn-option-list"
      [class]="listClass()"
      role="listbox"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-multiselectable]="selectionMode() === 'multiple' ? 'true' : null"
    >
      @for (item of items(); track itemId(item, $index); let index = $index) {
        <li class="syn-option-list__item" role="none">
          <button
            type="button"
            class="syn-option-list__option"
            [class]="optionClass(item, index)"
            role="option"
            [disabled]="item.disabled ?? false"
            [attr.aria-selected]="isSelected(item, index)"
            (click)="toggle(item, index)"
          >
            @if (item.imageSrc) {
              <img class="syn-option-list__image" [src]="item.imageSrc" [alt]="item.label" />
            } @else if (item.iconSymbol) {
              <syn-icon [symbol]="item.iconSymbol" />
            }

            <span class="syn-option-list__copy">
              <span class="syn-option-list__label">{{ item.label }}</span>

              @if (item.description) {
                <span class="syn-option-list__description">{{ item.description }}</span>
              }
            </span>

            @if (isSelected(item, index)) {
              <span class="syn-option-list__selected" aria-hidden="true">OK</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
  styleUrl: './option-list.scss',
})
export class OptionListComponent {
  readonly items = input<readonly OptionListItem[]>([]);
  readonly selectedIds = input<readonly string[]>([]);
  readonly layout = input<OptionListLayout>('list');
  readonly selectionMode = input<OptionSelectionMode>('single');
  readonly ariaLabel = input('Options');

  readonly #selection = linkedSignal(() => this.derivedSelection());

  readonly selectionChange = output<readonly string[]>();
  readonly itemSelected = output<OptionListItem>();

  readonly listClass = computed(() =>
    classNames(
      'syn-option-list',
      `syn-option-list--${this.layout()}`,
      `syn-option-list--${this.selectionMode()}`,
    ),
  );

  isSelected(item: OptionListItem, index: number): boolean {
    return this.#selection().includes(this.itemId(item, index));
  }

  toggle(item: OptionListItem, index: number): void {
    if (item.disabled) {
      return;
    }

    const id = this.itemId(item, index);
    const currentSelection = this.#selection();
    const nextSelection =
      this.selectionMode() === 'multiple'
        ? currentSelection.includes(id)
          ? currentSelection.filter((entry) => entry !== id)
          : [...currentSelection, id]
        : [id];

    this.#selection.set(nextSelection);
    this.selectionChange.emit(nextSelection);
    this.itemSelected.emit(item);
  }

  itemId(item: OptionListItem, index: number): string {
    return item.id ?? `syn-option-${index}`;
  }

  optionClass(item: OptionListItem, index: number): string {
    return classNames(
      'syn-option-list__option',
      this.isSelected(item, index) && 'syn-option-list__option--selected',
    );
  }

  private derivedSelection(): string[] {
    if (this.selectedIds().length > 0) {
      return [...this.selectedIds()];
    }

    return this.items()
      .map((item, index) => ({ item, id: this.itemId(item, index) }))
      .filter(({ item }) => item.selected)
      .map(({ id }) => id);
  }
}
