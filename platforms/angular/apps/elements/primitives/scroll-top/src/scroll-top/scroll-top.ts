import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynScrollTop</c>.
 *
 * A floating "back to top" button. It stays hidden until the page is scrolled
 * past `scrollThreshold` pixels, then fades in. Activating it (click, Enter or
 * Space) scrolls the window smoothly to the top — honoring
 * `prefers-reduced-motion`. A `scrolltotop` CustomEvent is emitted on activate.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface ScrollTopRuntimeConfig {
  readonly scrollThreshold?: number;
  readonly position?: ScrollTopPosition;
  readonly label?: string;
}

export type ScrollTopPosition = 'bottom-right' | 'bottom-left' | 'bottom-center';

const POSITIONS: readonly ScrollTopPosition[] = ['bottom-right', 'bottom-left', 'bottom-center'];

const DEFAULT_THRESHOLD = 320;
const DEFAULT_POSITION: ScrollTopPosition = 'bottom-right';
const DEFAULT_LABEL = 'Volver arriba';

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Clamp the threshold to a sane, non-negative pixel value. */
export function normalizeThreshold(value: unknown): number | undefined {
  const parsed = readNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(0, Math.round(parsed));
}

export function normalizePosition(value: unknown): ScrollTopPosition | undefined {
  return coerceStringEnumInput<ScrollTopPosition>(value, POSITIONS);
}

function sanitizeScrollTopConfig(value: Partial<ScrollTopRuntimeConfig>): ScrollTopRuntimeConfig {
  return omitUndefinedProperties<ScrollTopRuntimeConfig>({
    scrollThreshold: normalizeThreshold(value.scrollThreshold),
    position: normalizePosition(value.position),
    label: coerceTrimmedStringInput(value.label),
  });
}

@Component({
  selector: 'sg-scroll-top',
  standalone: true,
  templateUrl: './scroll-top.html',
  styleUrl: './scroll-top.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-scroll-top',
    '[attr.data-position]': 'position()',
    '[class.sg-scroll-top--visible]': 'visible()',
  },
})
export class ScrollTopElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<ScrollTopRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ScrollTopRuntimeConfig>(sanitizeScrollTopConfig),
  });
  readonly scrollThresholdInput = input<string | undefined>(undefined, { alias: 'scrollThreshold' });
  readonly positionInput = input<string | undefined>(undefined, { alias: 'position' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `scrolltotop` CustomEvent. */
  readonly scrolltotop = output<void>();

  readonly threshold = computed(() =>
    resolveConfigValue(
      normalizeThreshold(this.scrollThresholdInput()),
      this.config()?.scrollThreshold,
      DEFAULT_THRESHOLD,
    ),
  );

  readonly position = computed<ScrollTopPosition>(() =>
    resolveConfigValue(
      normalizePosition(this.positionInput()),
      this.config()?.position,
      DEFAULT_POSITION,
    ),
  );

  readonly label = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.labelInput()),
      this.config()?.label,
      DEFAULT_LABEL,
    ),
  );

  /** True once the page is scrolled past the threshold. */
  readonly #visible = signal(false);
  readonly visible = this.#visible.asReadonly();

  readonly #scrollListener = (): void => this.evaluateVisibility();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.#scrollListener, { passive: true });
      // Account for the case where the page is already scrolled at mount.
      this.evaluateVisibility();
      this.#destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', this.#scrollListener);
      });
    }
  }

  /** Recompute visibility from the current scroll offset. */
  evaluateVisibility(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const offset = window.scrollY ?? window.pageYOffset ?? 0;
    this.#visible.set(offset > this.threshold());
  }

  /** Scroll the window to the top, smoothly unless reduced motion is set. */
  scrollToTop(): void {
    this.scrolltotop.emit();

    if (typeof window === 'undefined') {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.scrollToTop();
    }
  }
}
