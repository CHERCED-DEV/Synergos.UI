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
import { t } from '@synergos/vitals-core';
import {
  ButtonComponent,
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
 *
 * Cada diapositiva puede enlazar (CMS#192, caso 4): `linkUrl` —la clave que autora el editor en
 * `slidesJson`— o `href`. La pieza del DS hace de la imagen el enlace.
 *
 * Su microcopia sale del diccionario, sección `Slider` (ADR 0136): este elemento la traduce con
 * `t()` y se la pasa a `syn-carousel` como texto. La pieza del DS pintaba «Previous»/«Next» en
 * inglés en un sitio en español.
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
      const href = readString(record['linkUrl']).trim() || readString(record['href']).trim();

      return {
        id,
        src,
        type: normalizeSlideType(record['type']),
        ...(alt ? { alt } : {}),
        ...(label ? { label } : {}),
        ...(thumbnailSrc ? { thumbnailSrc } : {}),
        ...(poster ? { poster } : {}),
        ...(href ? { href } : {}),
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
  imports: [ButtonComponent, CarouselComponent, HeadingComponent],
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

  /** La microcopia, del diccionario (sección `Slider`); el respaldo es el texto es-CO. */
  readonly ariaLabel = computed(() => this.title() || t('Slider.Aria', 'Galería'));
  readonly previousLabel = computed(() => t('Slider.Previous', 'Diapositiva anterior'));
  readonly nextLabel = computed(() => t('Slider.Next', 'Siguiente diapositiva'));
  readonly pagerLabel = computed(() => t('Slider.Pager', 'Diapositivas'));
  readonly slideLabel = computed(() => t('Slider.GoToSlide', 'Ir a diapositiva {n}'));
  readonly slidePositionLabel = computed(() => t('Slider.SlideOf', 'Diapositiva {n} de {total}'));

  readonly activeIndex = signal(0);
  readonly paused = signal(false);

  /**
   * El carrusel se mueve solo: WCAG 2.2.2 exige poder pausarlo. El botón sale sólo cuando de verdad
   * hay movimiento (autoplay, sin `prefers-reduced-motion` y con más de una diapositiva).
   */
  readonly autoplayActive = computed(
    () => this.autoplay() && !this.#prefersReducedMotion && this.slides().length > 1,
  );
  readonly autoplayToggleLabel = computed(() =>
    this.paused()
      ? t('Slider.Play', 'Reproducir presentación')
      : t('Slider.Pause', 'Pausar presentación'),
  );

  #autoplayTimer: ReturnType<typeof setInterval> | null = null;
  #prefersReducedMotion = false;

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.#prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    effect(() => {
      this.stopAutoplay();

      if (!this.autoplayActive() || this.paused()) {
        return;
      }

      this.#autoplayTimer = setInterval(() => this.advance(), this.interval());
    });

    this.#destroyRef.onDestroy(() => this.stopAutoplay());
  }

  onActiveIndexChange(index: number): void {
    this.activeIndex.set(index);
  }

  toggleAutoplay(): void {
    this.paused.update((paused) => !paused);
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
