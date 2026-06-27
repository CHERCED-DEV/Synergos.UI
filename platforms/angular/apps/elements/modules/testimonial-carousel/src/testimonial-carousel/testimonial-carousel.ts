import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynTestimonialCarousel</c>.
 *
 * A rotating wall of testimonials — quote + author + role + optional avatar
 * and rating. One slide shows at a time; the visitor advances with prev/next
 * buttons or the dot pager, and an optional autoplay loop rotates slides on a
 * timer that pauses on hover/focus and respects reduced-motion. Selecting or
 * changing the active slide emits a `slidechange` CustomEvent.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface TestimonialCarouselRuntimeConfig {
  readonly testimonials?: readonly TestimonialConfig[];
  readonly autoplay?: boolean;
  readonly autoplayInterval?: number;
  readonly loop?: boolean;
  readonly ariaLabel?: string;
}

export interface TestimonialConfig {
  readonly quote?: string;
  readonly author?: string;
  readonly role?: string;
  readonly avatar?: string;
  readonly avatarAlt?: string;
  readonly rating?: number;
}

export interface Testimonial {
  readonly id: string;
  readonly quote: string;
  readonly author: string;
  readonly role: string;
  readonly avatar: string;
  readonly avatarAlt: string;
  readonly initials: string;
  readonly rating: number;
}

/** Emitted on the `slidechange` CustomEvent and the typed Angular output. */
export interface TestimonialSlideChangeDetail {
  readonly index: number;
  readonly testimonial: Testimonial;
}

const DEFAULT_AUTOPLAY_INTERVAL = 6000;
const MIN_AUTOPLAY_INTERVAL = 1500;
const MAX_RATING = 5;
const DEFAULT_ARIA_LABEL = 'Testimonios';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readRating(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(readString(value));
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_RATING, Math.round(raw)));
}

/** First letters of the first two words of the author name, uppercased. */
function deriveInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function normalizeTestimonials(value: unknown): readonly Testimonial[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): Testimonial | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const quote = readString(entry['quote']).trim() || readString(entry['text']).trim();
      const author = readString(entry['author']).trim() || readString(entry['name']).trim();
      if (!quote || !author) {
        return null;
      }

      const avatar =
        readString(entry['avatar']).trim() ||
        readString(entry['image']).trim() ||
        readString(entry['photo']).trim();

      return {
        id: readString(entry['id']).trim() || `testimonial-${index}`,
        quote,
        author,
        role: readString(entry['role']).trim() || readString(entry['title']).trim(),
        avatar,
        avatarAlt: readString(entry['avatarAlt']).trim() || readString(entry['alt']).trim() || author,
        initials: deriveInitials(author),
        rating: readRating(entry['rating']),
      };
    })
    .filter((testimonial): testimonial is Testimonial => testimonial !== null);
}

function sanitizeCarouselConfig(
  value: Partial<TestimonialCarouselRuntimeConfig>,
): TestimonialCarouselRuntimeConfig {
  return omitUndefinedProperties<TestimonialCarouselRuntimeConfig>({
    testimonials: value.testimonials,
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    autoplayInterval: coerceOptionalNumberInput(value.autoplayInterval),
    loop: coerceOptionalBooleanInput(value.loop),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
  });
}

@Component({
  selector: 'sg-testimonial-carousel',
  standalone: true,
  templateUrl: './testimonial-carousel.html',
  styleUrl: './testimonial-carousel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-testimonial-carousel',
    '(mouseenter)': 'pause()',
    '(mouseleave)': 'resume()',
    '(focusin)': 'pause()',
    '(focusout)': 'resume()',
  },
})
export class TestimonialCarouselElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<TestimonialCarouselRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TestimonialCarouselRuntimeConfig>(sanitizeCarouselConfig),
  });
  readonly testimonialsInput = input<string | undefined>(undefined, { alias: 'testimonials' });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly autoplayIntervalInput = input<number | undefined, unknown>(undefined, {
    alias: 'autoplayInterval',
    transform: coerceOptionalNumberInput,
  });
  readonly loopInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loop',
    transform: coerceOptionalBooleanInput,
  });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `slidechange` CustomEvent. */
  readonly slidechange = output<TestimonialSlideChangeDetail>();

  readonly testimonials = computed<readonly Testimonial[]>(() =>
    normalizeTestimonials(this.resolveSource(this.testimonialsInput(), this.config()?.testimonials)),
  );

  readonly count = computed(() => this.testimonials().length);
  readonly hasTestimonials = computed(() => this.count() > 0);
  readonly hasMultiple = computed(() => this.count() > 1);

  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, DEFAULT_ARIA_LABEL),
  );
  readonly loop = computed(() => resolveConfigValue(this.loopInput(), this.config()?.loop, true));

  readonly autoplay = computed(() =>
    resolveConfigValue(this.autoplayInput(), this.config()?.autoplay, false),
  );

  /** Effective autoplay interval (ms), clamped to a sane floor. */
  readonly autoplayInterval = computed(() => {
    const resolved = resolveConfigValue(
      this.autoplayIntervalInput(),
      this.config()?.autoplayInterval,
      DEFAULT_AUTOPLAY_INTERVAL,
    );
    return Math.max(MIN_AUTOPLAY_INTERVAL, resolved);
  });

  /** Active slide index; always clamped to the available range. */
  readonly #activeIndex = signal(0);
  readonly activeIndex = computed(() => {
    const count = this.count();
    if (count === 0) {
      return 0;
    }
    return Math.min(this.#activeIndex(), count - 1);
  });

  readonly activeTestimonial = computed<Testimonial | null>(
    () => this.testimonials()[this.activeIndex()] ?? null,
  );

  /** True while a pointer/focus is over the carousel — suspends autoplay. */
  readonly #paused = signal(false);
  readonly isPaused = this.#paused.asReadonly();

  /** True while autoplay is actively cycling (autoplay on, >1 slide, not paused). */
  readonly #autoplayRunning = signal(false);
  readonly isAutoplaying = this.#autoplayRunning.asReadonly();

  constructor() {
    // Autoplay loop: re-arms whenever interval/pause/count/autoplay changes.
    effect((onCleanup) => {
      const enabled = this.autoplay() && this.hasMultiple() && !this.#paused();
      this.#autoplayRunning.set(enabled);

      if (!enabled || typeof setInterval !== 'function') {
        return;
      }

      const prefersReducedMotion =
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        this.#autoplayRunning.set(false);
        return;
      }

      const interval = this.autoplayInterval();
      const timer = setInterval(() => this.next(), interval);
      onCleanup(() => clearInterval(timer));
    });

    this.#destroyRef.onDestroy(() => {
      // Interval cleanup handled by effect onCleanup.
    });
  }

  next(): void {
    this.move(1);
  }

  previous(): void {
    this.move(-1);
  }

  goTo(index: number): void {
    const count = this.count();
    if (count === 0 || index < 0 || index >= count) {
      return;
    }
    this.setActive(index);
  }

  pause(): void {
    this.#paused.set(true);
  }

  resume(): void {
    this.#paused.set(false);
  }

  isActive(index: number): boolean {
    return this.activeIndex() === index;
  }

  /** 1..rating filled stars, rest empty — for the [★★★☆☆] strip. */
  starStates(rating: number): readonly boolean[] {
    return Array.from({ length: MAX_RATING }, (_, index) => index < rating);
  }

  /** Roving keyboard support on the viewport (Left/Right/Home/End). */
  onKeydown(event: KeyboardEvent): void {
    if (!this.hasMultiple()) {
      return;
    }

    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.next(),
      ArrowLeft: () => this.previous(),
      Home: () => this.goTo(0),
      End: () => this.goTo(this.count() - 1),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private move(delta: number): void {
    const count = this.count();
    if (count === 0) {
      return;
    }

    const current = this.activeIndex();
    let nextIndex = current + delta;

    if (this.loop()) {
      nextIndex = (nextIndex + count) % count;
    } else {
      nextIndex = Math.max(0, Math.min(count - 1, nextIndex));
    }

    if (nextIndex !== current) {
      this.setActive(nextIndex);
    }
  }

  private setActive(index: number): void {
    this.#activeIndex.set(index);
    const testimonial = this.testimonials()[index];
    if (testimonial) {
      this.slidechange.emit({ index, testimonial });
    }
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
