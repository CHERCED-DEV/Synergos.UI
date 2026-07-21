import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { BadgeComponent } from '../../primitives/badge/badge';
import { IconComponent } from '../../primitives/icon/icon';
import { classNames } from '../../../utils/class-names.util';

export interface SegmentedControlOption {
  readonly id: string;
  readonly label: string;
  readonly iconSymbol?: string;
  readonly badge?: string;
  readonly disabled?: boolean;
  readonly value?: unknown;
}

@Component({
  selector: 'syn-segmented-control',
  standalone: true,
  imports: [BadgeComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-segmented-control" [class]="controlClass()">
      @if (hasOverflow()) {
        <button type="button" class="syn-segmented-control__nav" [disabled]="!canMovePrevious()" (click)="movePrevious()">
          Prev
        </button>
      }

      <div class="syn-segmented-control__list" role="tablist" [attr.aria-label]="ariaLabel()">
        @for (option of visibleOptions(); track option.id) {
          <button
            type="button"
            class="syn-segmented-control__option"
            [class.syn-segmented-control__option--active]="activeId() === option.id"
            role="tab"
            [disabled]="option.disabled ?? false"
            [attr.aria-selected]="activeId() === option.id"
            (click)="select(option)"
          >
            @if (option.iconSymbol) {
              <syn-icon [symbol]="option.iconSymbol" />
            }

            <span class="syn-segmented-control__label">{{ option.label }}</span>

            @if (option.badge) {
              <syn-badge [text]="option.badge" />
            }
          </button>
        }
      </div>

      @if (hasOverflow()) {
        <button type="button" class="syn-segmented-control__nav" [disabled]="!canMoveNext()" (click)="moveNext()">
          Next
        </button>
      }
    </div>
  `,
  styleUrl: './segmented-control.scss',
})
export class SegmentedControlComponent {
  readonly options = input<readonly SegmentedControlOption[]>([]);
  readonly value = input('');
  readonly ariaLabel = input('Segmented control');
  readonly maxVisible = input(4);
  readonly compact = input(false);

  readonly #requestedWindowStart = signal(0);
  readonly activeId = linkedSignal(() => this.resolveActiveId());

  readonly activeIdChange = output<string>();
  readonly optionSelected = output<SegmentedControlOption>();

  readonly activeIndex = computed(() =>
    this.options().findIndex((option) => option.id === this.activeId()),
  );
  readonly hasOverflow = computed(() => this.options().length > this.maxVisible());
  readonly windowStart = computed(() => {
    const maxVisible = Math.max(1, this.maxVisible());
    const maxStart = Math.max(0, this.options().length - maxVisible);
    return Math.min(Math.max(0, this.#requestedWindowStart()), maxStart);
  });
  readonly visibleOptions = computed(() => {
    const start = this.windowStart();
    return this.options().slice(start, start + Math.max(1, this.maxVisible()));
  });
  readonly canMovePrevious = computed(() => this.windowStart() > 0);
  readonly canMoveNext = computed(() => {
    const maxVisible = Math.max(1, this.maxVisible());
    return this.windowStart() + maxVisible < this.options().length;
  });
  readonly controlClass = computed(() =>
    classNames('syn-segmented-control', this.compact() && 'syn-segmented-control--compact'),
  );

  select(option: SegmentedControlOption): void {
    if (option.disabled) {
      return;
    }

    this.activeId.set(option.id);
    this.activeIdChange.emit(option.id);
    this.optionSelected.emit(option);
  }

  movePrevious(): void {
    this.#requestedWindowStart.update((value) => Math.max(0, value - 1));
  }

  moveNext(): void {
    this.#requestedWindowStart.update((value) => value + 1);
  }

  private resolveActiveId(): string {
    if (this.value()) {
      return this.value();
    }

    const firstEnabled = this.options().find((option) => !option.disabled);
    return firstEnabled?.id ?? '';
  }
}
