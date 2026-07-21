import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSplitter</c>.
 *
 * A divisible panel: two regions separated by a draggable handle. The visitor
 * drags (or uses the keyboard) the separator to resize the leading region
 * against the trailing one. Works horizontally (side-by-side) or vertically
 * (stacked). The split position is a percentage of the leading region, clamped
 * between `minSplit` and `maxSplit`. Each resize emits a `splitchange`
 * CustomEvent carrying the new percentage.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface SplitterRuntimeConfig {
  readonly orientation?: string;
  readonly leftContent?: string;
  readonly rightContent?: string;
  readonly leftLabel?: string;
  readonly rightLabel?: string;
  readonly initialSplit?: number;
  readonly minSplit?: number;
  readonly maxSplit?: number;
}

export type SplitterOrientation = 'horizontal' | 'vertical';

/** Emitted on the `splitchange` CustomEvent and the typed Angular output. */
export interface SplitterChangeDetail {
  readonly split: number;
  readonly orientation: SplitterOrientation;
}

const DEFAULT_SPLIT = 50;
const DEFAULT_MIN = 10;
const DEFAULT_MAX = 90;
const KEYBOARD_STEP = 2;
const KEYBOARD_STEP_LARGE = 10;

/** Clamp a numeric percentage into the [min, max] band. */
export function clampSplit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** Round to one decimal so percentages stay tidy after drag math. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeOrientation(value: unknown): SplitterOrientation {
  return coerceTrimmedStringInput(value)?.toLowerCase() === 'vertical'
    ? 'vertical'
    : 'horizontal';
}

function sanitizeSplitterConfig(value: Partial<SplitterRuntimeConfig>): SplitterRuntimeConfig {
  return omitUndefinedProperties<SplitterRuntimeConfig>({
    orientation: coerceTrimmedStringInput(value.orientation),
    leftContent: coerceTrimmedStringInput(value.leftContent),
    rightContent: coerceTrimmedStringInput(value.rightContent),
    leftLabel: coerceTrimmedStringInput(value.leftLabel),
    rightLabel: coerceTrimmedStringInput(value.rightLabel),
    initialSplit: coerceOptionalNumberInput(value.initialSplit),
    minSplit: coerceOptionalNumberInput(value.minSplit),
    maxSplit: coerceOptionalNumberInput(value.maxSplit),
  });
}

@Component({
  selector: 'sg-splitter',
  standalone: true,
  templateUrl: './splitter.html',
  styleUrl: './splitter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-splitter' },
})
export class SplitterElementComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly config = input<SplitterRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SplitterRuntimeConfig>(sanitizeSplitterConfig),
  });
  readonly orientationInput = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly leftContentInput = input<string | undefined>(undefined, { alias: 'leftContent' });
  readonly rightContentInput = input<string | undefined>(undefined, { alias: 'rightContent' });
  readonly leftLabelInput = input<string | undefined>(undefined, { alias: 'leftLabel' });
  readonly rightLabelInput = input<string | undefined>(undefined, { alias: 'rightLabel' });
  readonly initialSplitInput = input<number | undefined, unknown>(undefined, {
    alias: 'initialSplit',
    transform: coerceOptionalNumberInput,
  });
  readonly minSplitInput = input<number | undefined, unknown>(undefined, {
    alias: 'minSplit',
    transform: coerceOptionalNumberInput,
  });
  readonly maxSplitInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxSplit',
    transform: coerceOptionalNumberInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `splitchange` CustomEvent. */
  readonly splitchange = output<SplitterChangeDetail>();

  readonly orientation = computed<SplitterOrientation>(() =>
    normalizeOrientation(resolveConfigValue(this.orientationInput(), this.config()?.orientation, 'horizontal')),
  );

  readonly leftContent = computed(() =>
    resolveConfigValue(this.leftContentInput(), this.config()?.leftContent, ''),
  );
  readonly rightContent = computed(() =>
    resolveConfigValue(this.rightContentInput(), this.config()?.rightContent, ''),
  );
  readonly leftLabel = computed(() =>
    resolveConfigValue(this.leftLabelInput(), this.config()?.leftLabel, 'Panel inicial'),
  );
  readonly rightLabel = computed(() =>
    resolveConfigValue(this.rightLabelInput(), this.config()?.rightLabel, 'Panel final'),
  );

  readonly minSplit = computed(() =>
    clampSplit(resolveConfigValue(this.minSplitInput(), this.config()?.minSplit, DEFAULT_MIN), 0, 100),
  );
  readonly maxSplit = computed(() => {
    const max = clampSplit(resolveConfigValue(this.maxSplitInput(), this.config()?.maxSplit, DEFAULT_MAX), 0, 100);
    return max > this.minSplit() ? max : Math.min(100, this.minSplit() + 1);
  });

  /** Live split position (% of the leading region). */
  readonly #split = signal<number | null>(null);

  /** Resolved split: live value if dragged, else the configured initial. */
  readonly split = computed(() => {
    const live = this.#split();
    const initial = clampSplit(
      resolveConfigValue(this.initialSplitInput(), this.config()?.initialSplit, DEFAULT_SPLIT),
      this.minSplit(),
      this.maxSplit(),
    );
    if (live === null) {
      return initial;
    }
    return clampSplit(live, this.minSplit(), this.maxSplit());
  });

  readonly trailingSplit = computed(() => round1(100 - this.split()));

  readonly isDragging = signal(false);

  /** Whether a separator drag is currently captured. */
  #activePointerId: number | null = null;

  setSplit(value: number, emit = true): void {
    const next = round1(clampSplit(value, this.minSplit(), this.maxSplit()));
    if (next === this.split()) {
      return;
    }
    this.#split.set(next);
    if (emit) {
      this.splitchange.emit({ split: next, orientation: this.orientation() });
    }
  }

  reset(): void {
    const initial = clampSplit(
      resolveConfigValue(this.initialSplitInput(), this.config()?.initialSplit, DEFAULT_SPLIT),
      this.minSplit(),
      this.maxSplit(),
    );
    this.setSplit(initial);
  }

  onSeparatorKeydown(event: KeyboardEvent): void {
    const vertical = this.orientation() === 'vertical';
    const decrease = vertical ? 'ArrowUp' : 'ArrowLeft';
    const increase = vertical ? 'ArrowDown' : 'ArrowRight';

    const handlers: Record<string, () => void> = {
      [decrease]: () => this.setSplit(this.split() - KEYBOARD_STEP),
      [increase]: () => this.setSplit(this.split() + KEYBOARD_STEP),
      ArrowLeft: () => this.setSplit(this.split() - KEYBOARD_STEP),
      ArrowRight: () => this.setSplit(this.split() + KEYBOARD_STEP),
      ArrowUp: () => this.setSplit(this.split() - KEYBOARD_STEP),
      ArrowDown: () => this.setSplit(this.split() + KEYBOARD_STEP),
      PageUp: () => this.setSplit(this.split() - KEYBOARD_STEP_LARGE),
      PageDown: () => this.setSplit(this.split() + KEYBOARD_STEP_LARGE),
      Home: () => this.setSplit(this.minSplit()),
      End: () => this.setSplit(this.maxSplit()),
      Enter: () => this.reset(),
    };

    // Resolve orientation-correct arrows first, then fall back to the map.
    const handler =
      (event.key === decrease && handlers[decrease]) ||
      (event.key === increase && handlers[increase]) ||
      handlers[event.key];

    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  onSeparatorPointerDown(event: PointerEvent): void {
    // Only the primary button / touch / pen initiates a drag.
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    this.#activePointerId = event.pointerId;
    this.isDragging.set(true);
    (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onSeparatorPointerMove(event: PointerEvent): void {
    if (!this.isDragging() || event.pointerId !== this.#activePointerId) {
      return;
    }
    const rect = this.#panesRect();
    if (!rect) {
      return;
    }

    const ratio =
      this.orientation() === 'vertical'
        ? (event.clientY - rect.top) / rect.height
        : (event.clientX - rect.left) / rect.width;

    if (!Number.isFinite(ratio)) {
      return;
    }
    this.setSplit(ratio * 100);
  }

  onSeparatorPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.#activePointerId) {
      return;
    }
    this.isDragging.set(false);
    this.#activePointerId = null;
    (event.target as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  #panesRect(): DOMRect | null {
    const root = this.#host.nativeElement.shadowRoot ?? this.#host.nativeElement;
    const panes = (root as ParentNode).querySelector<HTMLElement>('.splitter__panes');
    return panes?.getBoundingClientRect() ?? null;
  }
}
