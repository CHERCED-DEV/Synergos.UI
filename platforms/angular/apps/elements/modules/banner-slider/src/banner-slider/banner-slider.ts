import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  signal,
} from '@angular/core';
import type { BannerSliderElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  ButtonComponent,
  CarouselComponent,
  type CarouselItem,
  HeadingComponent,
  type HeadingTone,
  coerceOptionalBooleanInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

interface BannerSlideItem {
  readonly id: string;
  readonly label: string;
  readonly body: string;
  readonly src: string;
  readonly alt: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
  readonly ctaTarget: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeSlide(value: unknown, index: number): BannerSlideItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const src = readString(value['imageSrc'] ?? value['src']).trim();
  const label = readString(value['title'] ?? value['label']).trim();
  const body = readString(value['body']).trim();
  const ctaLabel = readString(value['ctaLabel']).trim();
  const ctaUrl = readString(value['ctaUrl']).trim();

  if (!src && !label && !body && !ctaLabel && !ctaUrl) {
    return null;
  }

  return {
    id: readString(value['id']).trim() || `slide-${index + 1}`,
    label,
    body,
    src,
    alt: readString(value['imageAlt'] ?? value['alt']).trim(),
    ctaLabel,
    ctaUrl,
    ctaTarget: readString(value['ctaTarget']).trim() || '_self',
  };
}

export function normalizeSlides(value: unknown): readonly BannerSlideItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item, index) => normalizeSlide(item, index))
    .filter((item): item is BannerSlideItem => item !== null);

  return items.length > 0 ? items : undefined;
}

function readLegacySlides(value: Partial<BannerSliderElementConfig>): unknown {
  return isRecord(value) ? (value as Record<string, unknown>)['items'] : undefined;
}

export function sanitizeBannerSliderConfig(
  value: Partial<BannerSliderElementConfig>,
): Partial<BannerSliderElementConfig> {
  const slides = normalizeSlides(value.slides) ?? normalizeSlides(readLegacySlides(value));

  return omitUndefinedProperties<Partial<BannerSliderElementConfig>>({
    headingText: coerceTrimmedStringInput(value.headingText),
    body: coerceTrimmedStringInput(value.body),
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    loop: coerceOptionalBooleanInput(value.loop),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
    slides,
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-banner-slider',
  imports: [ButtonComponent, CarouselComponent, HeadingComponent],
  templateUrl: './banner-slider.html',
  styleUrl: './banner-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-banner-slider', '[style.display]': 'hasSlides() ? null : "none"' },
})
export class BannerSliderElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #activeIndex = signal(0);

  readonly config = input<Partial<BannerSliderElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<BannerSliderElementConfig>>(sanitizeBannerSliderConfig),
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly loopInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loop',
    transform: coerceOptionalBooleanInput,
  });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.config()?.body, ''),
  );
  readonly autoplay = computed(() =>
    resolveConfigValue(this.autoplayInput(), this.config()?.autoplay, false),
  );
  readonly loop = computed(() =>
    resolveConfigValue(this.loopInput(), this.config()?.loop, true),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly parsedItems = computed<readonly BannerSlideItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.itemsInput());
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item, index) => normalizeSlide(item, index))
        .filter((item): item is BannerSlideItem => item !== null);
    }

    const configSlides = normalizeSlides(this.config()?.slides);
    if (configSlides) {
      return configSlides;
    }

    return [];
  });
  readonly currentIndex = computed(() => {
    const total = this.parsedItems().length;
    if (total === 0) {
      return 0;
    }

    return Math.min(this.#activeIndex(), total - 1);
  });
  readonly activeSlide = computed(() => this.parsedItems()[this.currentIndex()] ?? null);
  readonly carouselItems = computed<readonly CarouselItem[]>(() =>
    this.parsedItems().map((item) => ({
      id: item.id,
      src: item.src,
      alt: item.alt,
      label: item.label,
      thumbnailSrc: item.src,
    })),
  );
  readonly hasSlides = computed(() => this.parsedItems().length > 0);
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly translations = computed(() => this.config()?.translations ?? {});
  readonly carouselAriaLabel = computed(() => this.translations()['carouselAriaLabel'] ?? 'Banner slides');
  readonly hostClasses = computed(
    () => `banner-slider--${this.variant()} banner-slider--${this.theme()}`,
  );

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasSlides() && (this.itemsInput() !== undefined || this.config() !== undefined)) {
          console.warn('[synergos-banner-slider] Slides resolved to empty. Check your "items" attribute or "config.slides" array format.');
        }
      });
    }

    effect((onCleanup) => {
      if (!this.autoplay() || this.parsedItems().length < 2) {
        return;
      }

      const intervalId = window.setInterval(() => {
        this.advanceSlide();
      }, 5000);

      onCleanup(() => window.clearInterval(intervalId));
    });
  }

  setActiveIndex(index: number): void {
    this.#activeIndex.set(index);
  }

  resolvedRel(slide: BannerSlideItem): string {
    return slide.ctaTarget === '_blank' ? 'noopener noreferrer' : '';
  }

  private advanceSlide(): void {
    const total = this.parsedItems().length;
    if (total < 2) {
      return;
    }

    const currentIndex = this.currentIndex();
    if (currentIndex >= total - 1) {
      if (this.loop()) {
        this.#activeIndex.set(0);
      }
      return;
    }

    this.#activeIndex.set(currentIndex + 1);
  }
}
