import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  CarouselComponent,
  type CarouselItem,
  type CarouselItemType,
  HeadingComponent,
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynCarousel</c>.
 *
 * An immersive media gallery (image + optional video) suited to a real
 * estate property ficha. Delegates rendering to the shared
 * `syn-carousel` pattern; this wrapper owns CMS config parsing + autoplay.
 *
 * The shared `@synergos/contracts` package does not declare a standalone
 * `CarouselElementConfig`; the canonical shape lives here until that
 * contract lands in the registry ola.
 */
export interface CarouselRuntimeConfig {
  readonly title?: string;
  readonly slides?: readonly CarouselSlideConfig[];
  readonly autoplay?: boolean;
  readonly interval?: number;
  readonly loop?: boolean;
  readonly compact?: boolean;
}

export interface CarouselSlideConfig {
  readonly id?: string;
  readonly src?: string;
  readonly type?: string;
  readonly alt?: string;
  readonly label?: string;
  readonly thumbnailSrc?: string;
  readonly poster?: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeSlideType(value: unknown): CarouselItemType {
  return readString(value).trim().toLowerCase() === 'video' ? 'video' : 'image';
}

export function normalizeSlides(value: unknown): readonly CarouselItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const slides = value
    .map((entry, index): CarouselItem | null => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const src = readString(record['src']).trim();
      if (!src) {
        return null;
      }

      const id = readString(record['id']).trim() || `slide-${index}`;
      const alt = readString(record['alt']).trim();
      const label = readString(record['label']).trim();
      const thumbnailSrc = readString(record['thumbnailSrc']).trim();
      const poster = readString(record['poster']).trim();

      return {
        id,
        src,
        type: normalizeSlideType(record['type']),
        ...(alt ? { alt } : {}),
        ...(label ? { label } : {}),
        ...(thumbnailSrc ? { thumbnailSrc } : {}),
        ...(poster ? { poster } : {}),
      };
    })
    .filter((slide): slide is CarouselItem => slide !== null);

  return slides.length > 0 ? slides : undefined;
}

function sanitizeCarouselConfig(value: Partial<CarouselRuntimeConfig>): CarouselRuntimeConfig {
  return omitUndefinedProperties<CarouselRuntimeConfig>({
    title: coerceTrimmedStringInput(value.title),
    slides: normalizeSlides(value.slides) as CarouselRuntimeConfig['slides'],
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    interval: coerceOptionalNumberInput(value.interval),
    loop: coerceOptionalBooleanInput(value.loop),
    compact: coerceOptionalBooleanInput(value.compact),
  });
}

@Component({
  selector: 'sg-carousel',
  standalone: true,
  imports: [CarouselComponent, HeadingComponent],
  templateUrl: './carousel.html',
  styleUrl: './carousel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-carousel', '[style.display]': 'hasSlides() ? null : "none"' },
})
export class CarouselElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CarouselRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CarouselRuntimeConfig>(sanitizeCarouselConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly slidesInput = input<string | undefined>(undefined, { alias: 'slides' });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly intervalInput = input<number | undefined, unknown>(undefined, {
    alias: 'interval',
    transform: coerceOptionalNumberInput,
  });
  readonly loopInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loop',
    transform: coerceOptionalBooleanInput,
  });
  readonly compactInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'compact',
    transform: coerceOptionalBooleanInput,
  });

  readonly title = computed(() => resolveConfigValue(this.titleInput(), this.config()?.title, ''));
  readonly loop = computed(() => resolveConfigValue(this.loopInput(), this.config()?.loop, true));
  readonly compact = computed(() =>
    resolveConfigValue(this.compactInput(), this.config()?.compact, false),
  );
  readonly autoplay = computed(() =>
    resolveConfigValue(this.autoplayInput(), this.config()?.autoplay, false),
  );
  readonly interval = computed(() => {
    const resolved = resolveConfigValue(this.intervalInput(), this.config()?.interval, 5000);
    return resolved >= 1000 ? resolved : 5000;
  });

  readonly slides = computed<readonly CarouselItem[]>(() => {
    if (this.slidesInput() !== undefined) {
      const parsed = this.#initialData.parseValue<unknown>(this.slidesInput());
      return normalizeSlides(parsed) ?? [];
    }

    return normalizeSlides(this.config()?.slides) ?? [];
  });

  readonly hasSlides = computed(() => this.slides().length > 0);
  readonly hasTitle = computed(() => this.title().trim().length > 0);

  readonly activeIndex = signal(0);

  #autoplayTimer: ReturnType<typeof setInterval> | null = null;
  #prefersReducedMotion = false;

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.#prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    effect(() => {
      this.stopAutoplay();

      const canAutoplay =
        this.autoplay() &&
        !this.#prefersReducedMotion &&
        this.slides().length > 1;

      if (!canAutoplay) {
        return;
      }

      this.#autoplayTimer = setInterval(() => this.advance(), this.interval());
    });

    this.#destroyRef.onDestroy(() => this.stopAutoplay());
  }

  onActiveIndexChange(index: number): void {
    this.activeIndex.set(index);
  }

  private advance(): void {
    const total = this.slides().length;
    if (total <= 1) {
      return;
    }

    const next = (this.activeIndex() + 1) % total;
    this.activeIndex.set(next);
  }

  private stopAutoplay(): void {
    if (this.#autoplayTimer !== null) {
      clearInterval(this.#autoplayTimer);
      this.#autoplayTimer = null;
    }
  }
}
