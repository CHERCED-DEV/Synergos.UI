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
import type { CarouselProps } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  CarouselComponent,
  type CarouselItem,
  type CarouselItemType,
  HeadingComponent,
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-carousel>: an immersive media gallery (image + optional video) suited to a real
 * estate property ficha. Delegates rendering to the shared `syn-carousel` pattern; this
 * wrapper owns CMS config parsing + autoplay.
 *
 * El `config` que manda el CMS tiene la forma de `CarouselProps`, GENERADO del record C#
 * (ADR 0135): `slides` es una LISTA ya parseada (`src`/`alt`/`label`), y `autoplay` +
 * `interval`. La vista mandaba el TEXTO `slidesJson` y `autoplayInterval`, y sin diapositivas
 * este elemento se oculta: el carrusel colocado no se veía (D1). `title`, `loop`, `compact` y
 * los campos ricos de una diapositiva (`type`, `poster`, `thumbnailSrc`) no los autora el
 * editor: llegan por atributo (`slides` como JSON), que gana sobre el `config`.
 */

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

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeCarouselConfig(value: Partial<CarouselProps>): Partial<CarouselProps> {
  return omitUndefinedProperties<CarouselProps>({
    slides: normalizeSlides(value.slides),
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    interval: coerceOptionalNumberInput(value.interval),
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

  readonly config = input<Partial<CarouselProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CarouselProps>(sanitizeCarouselConfig),
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

  readonly title = computed(() => this.titleInput() ?? '');
  readonly loop = computed(() => this.loopInput() ?? true);
  readonly compact = computed(() => this.compactInput() ?? false);
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
