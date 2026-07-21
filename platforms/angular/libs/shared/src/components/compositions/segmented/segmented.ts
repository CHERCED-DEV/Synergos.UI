import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChildren,
} from '@angular/core';
import { IconComponent } from '../../primitives/icon/icon';

/**
 * One selectable segment. `value` is the identity fed back through `valueChange`.
 * `icon` is an optional decorative glyph symbol (rendered via `syn-icon`).
 */
export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
}

export type SegmentedSize = 'sm' | 'md' | 'lg';

let segmentedInstanceSequence = 0;

function nextSegmentedInstanceId(): string {
  segmentedInstanceSequence += 1;
  return `syn-segmented-${segmentedInstanceSequence}`;
}

/**
 * `syn-segmented` — an ARIA **radiogroup** that switches the SAME data between
 * mutually exclusive views/modes (list ↔ split ↔ map, day ↔ week, grid ↔ table…).
 *
 * Semantically this is NOT `syn-tabs`: it owns no tabpanel and swaps no content
 * itself — it is a single-choice control whose `valueChange` a sibling container
 * reacts to. Follows the APG radiogroup pattern: roving tabindex, arrow keys move
 * **and** select with wrap (Left/Up = previous, Right/Down = next), Home/End jump
 * to the edges, and keyboard focus follows the selection.
 */
@Component({
  selector: 'syn-segmented',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="syn-segmented"
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
      [attr.data-size]="size()"
    >
      @for (option of options(); track option.value; let index = $index) {
        <button
          #radio
          type="button"
          class="syn-segmented__option"
          role="radio"
          [id]="optionId(option.value)"
          [attr.aria-checked]="selectedValue() === option.value"
          [attr.tabindex]="selectedValue() === option.value ? 0 : -1"
          [disabled]="option.disabled ?? false"
          (click)="select(option.value)"
          (keydown)="onKeydown($event, index)"
        >
          @if (option.icon) {
            <syn-icon class="syn-segmented__icon" [symbol]="option.icon" />
          }
          <span class="syn-segmented__label">{{ option.label }}</span>
        </button>
      }
    </div>
  `,
  styleUrl: './segmented.scss',
})
export class SegmentedComponent {
  readonly options = input<readonly SegmentedOption[]>([]);
  readonly value = input('');
  readonly ariaLabel = input('Segmented');
  readonly size = input<SegmentedSize>('md');

  readonly valueChange = output<string>();

  /** Rendered radios, in DOM (and `options()`) order — used for roving focus. */
  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  readonly #instanceId = nextSegmentedInstanceId();

  /**
   * Effective selection. Follows the `value` input when it points at an enabled
   * option; otherwise defaults to the first enabled segment (never floats on a
   * disabled/absent value). Writable so keyboard/click selection sticks until the
   * parent feeds a new `value`.
   */
  readonly selectedValue = linkedSignal<string>(() => {
    const provided = this.value();
    if (provided && this.options().some((option) => option.value === provided && !option.disabled)) {
      return provided;
    }
    const firstEnabled = this.options().find((option) => !option.disabled);
    return firstEnabled?.value ?? '';
  });

  select(value: string): void {
    const option = this.options().find((item) => item.value === value);
    // Re-selecting the active segment is a no-op (no re-emit) — idempotent.
    if (!option || option.disabled || value === this.selectedValue()) {
      return;
    }

    this.selectedValue.set(value);
    this.valueChange.emit(value);
  }

  onKeydown(event: KeyboardEvent, currentIndex: number): void {
    if (this.options().length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.#moveTo(this.#neighborIndex(currentIndex, 1));
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.#moveTo(this.#neighborIndex(currentIndex, -1));
        return;
      case 'Home':
        event.preventDefault();
        this.#moveTo(this.#edgeIndex(1));
        return;
      case 'End':
        event.preventDefault();
        this.#moveTo(this.#edgeIndex(-1));
        return;
      case ' ':
      case 'Enter':
        // Select the focused segment; no-op if it is already selected.
        event.preventDefault();
        this.select(this.options()[currentIndex]?.value ?? '');
        return;
      default:
        return;
    }
  }

  /**
   * Next enabled option index in `direction`, wrapping around and skipping
   * disabled options. Starting from a disabled option still lands on the nearest
   * enabled neighbour in that direction.
   */
  #neighborIndex(from: number, direction: 1 | -1): number {
    const options = this.options();
    const count = options.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (((from + direction * step) % count) + count) % count;
      if (!options[index]?.disabled) {
        return index;
      }
    }
    return -1;
  }

  /** First (direction 1) or last (direction -1) enabled option index. */
  #edgeIndex(direction: 1 | -1): number {
    const options = this.options();
    if (direction === 1) {
      return options.findIndex((option) => !option.disabled);
    }
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.disabled) {
        return index;
      }
    }
    return -1;
  }

  /** Select the option at `index` and move keyboard focus to its radio. */
  #moveTo(index: number): void {
    if (index < 0) {
      return;
    }

    const option = this.options()[index];
    if (!option || option.disabled) {
      return;
    }

    this.select(option.value);
    this.#focusOption(index);
  }

  #focusOption(index: number): void {
    const button = this.radios()[index]?.nativeElement;
    if (!button) {
      return;
    }

    button.focus();
    button.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  optionId(value: string): string {
    return `${this.#instanceId}-radio-${value}`;
  }
}
