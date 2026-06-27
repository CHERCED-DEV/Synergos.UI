import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  LinkComponent,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynHeroBanner</c>.
 *
 * A full-bleed hero: a background image (or solid surface fallback) under a
 * legibility scrim, with an optional eyebrow, a headline, supporting copy and
 * a single call-to-action. This is the CDN variant of the hero — the content
 * (image, copy, link) is composed in the CMS and rendered here. Activating the
 * CTA emits a `ctaactivate` CustomEvent carrying the resolved href + label.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type HeroBannerAlign = 'start' | 'center';
export type HeroBannerTone = 'auto' | 'light' | 'dark';
export type HeroBannerHeight = 'sm' | 'md' | 'lg';

const ALIGN_VALUES: readonly HeroBannerAlign[] = ['start', 'center'];
const TONE_VALUES: readonly HeroBannerTone[] = ['auto', 'light', 'dark'];
const HEIGHT_VALUES: readonly HeroBannerHeight[] = ['sm', 'md', 'lg'];

export interface HeroBannerRuntimeConfig {
  readonly eyebrow?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly media?: string;
  readonly mediaAlt?: string;
  readonly ctaLabel?: string;
  readonly ctaLink?: string;
  readonly align?: HeroBannerAlign;
  readonly tone?: HeroBannerTone;
  readonly height?: HeroBannerHeight;
}

/** Emitted on the `ctaactivate` CustomEvent and the typed Angular output. */
export interface HeroBannerCtaDetail {
  readonly href: string;
  readonly label: string;
}

function sanitizeHeroBannerConfig(
  value: Partial<HeroBannerRuntimeConfig>,
): Partial<HeroBannerRuntimeConfig> {
  return omitUndefinedProperties<HeroBannerRuntimeConfig>({
    eyebrow: coerceTrimmedStringInput(value.eyebrow),
    title: coerceTrimmedStringInput(value.title),
    subtitle: coerceTrimmedStringInput(value.subtitle),
    media: coerceTrimmedStringInput(value.media),
    mediaAlt: coerceTrimmedStringInput(value.mediaAlt),
    ctaLabel: coerceTrimmedStringInput(value.ctaLabel),
    ctaLink: coerceTrimmedStringInput(value.ctaLink),
    align: coerceStringEnumInput(value.align, ALIGN_VALUES),
    tone: coerceStringEnumInput(value.tone, TONE_VALUES),
    height: coerceStringEnumInput(value.height, HEIGHT_VALUES),
  });
}

@Component({
  selector: 'sg-hero-banner',
  standalone: true,
  imports: [LinkComponent],
  templateUrl: './hero-banner.html',
  styleUrl: './hero-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-hero-banner',
    '[attr.data-align]': 'align()',
    '[attr.data-tone]': 'resolvedTone()',
    '[attr.data-height]': 'height()',
    '[attr.data-has-media]': 'hasMedia() ? "" : null',
  },
})
export class HeroBannerElementComponent {
  readonly config = input<HeroBannerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<HeroBannerRuntimeConfig>(sanitizeHeroBannerConfig),
  });
  readonly eyebrowInput = input<string | undefined>(undefined, { alias: 'eyebrow' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly subtitleInput = input<string | undefined>(undefined, { alias: 'subtitle' });
  readonly mediaInput = input<string | undefined>(undefined, { alias: 'media' });
  readonly mediaAltInput = input<string | undefined>(undefined, { alias: 'mediaAlt' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaLinkInput = input<string | undefined>(undefined, { alias: 'ctaLink' });
  readonly alignInput = input<HeroBannerAlign | undefined>(undefined, { alias: 'align' });
  readonly toneInput = input<HeroBannerTone | undefined>(undefined, { alias: 'tone' });
  readonly heightInput = input<HeroBannerHeight | undefined>(undefined, { alias: 'height' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `ctaactivate` CustomEvent. */
  readonly ctaactivate = output<HeroBannerCtaDetail>();

  readonly eyebrow = computed(() =>
    resolveConfigValue(this.eyebrowInput(), this.config()?.eyebrow, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.config()?.subtitle, ''),
  );
  readonly media = computed(() =>
    resolveConfigValue(this.mediaInput(), this.config()?.media, ''),
  );
  readonly mediaAlt = computed(() =>
    resolveConfigValue(this.mediaAltInput(), this.config()?.mediaAlt, ''),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.config()?.ctaLabel, ''),
  );
  readonly ctaLink = computed(() =>
    resolveConfigValue(this.ctaLinkInput(), this.config()?.ctaLink, ''),
  );
  readonly align = computed<HeroBannerAlign>(() =>
    resolveConfigValue(this.alignInput(), this.config()?.align, 'start'),
  );
  readonly tone = computed<HeroBannerTone>(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'auto'),
  );
  readonly height = computed<HeroBannerHeight>(() =>
    resolveConfigValue(this.heightInput(), this.config()?.height, 'md'),
  );

  readonly hasMedia = computed(() => this.media().length > 0);

  /** Decorative images carry empty alt; a described image is announced. */
  readonly imageAlt = computed(() => this.mediaAlt());
  readonly imageDecorative = computed(() => this.mediaAlt().length === 0);

  /**
   * Effective tone for the overlay/text. `auto` darkens-for-light-text when a
   * background image is present, and falls back to the surface tone otherwise.
   */
  readonly resolvedTone = computed<'light' | 'dark'>(() => {
    const tone = this.tone();
    if (tone === 'light' || tone === 'dark') {
      return tone;
    }
    return this.hasMedia() ? 'dark' : 'light';
  });

  /** Inverse link tone reads on dark scrims; brand reads on light surfaces. */
  readonly ctaTone = computed<'brand' | 'inverse'>(() =>
    this.resolvedTone() === 'dark' ? 'inverse' : 'brand',
  );

  readonly hasEyebrow = computed(() => this.eyebrow().length > 0);
  readonly hasTitle = computed(() => this.title().length > 0);
  readonly hasSubtitle = computed(() => this.subtitle().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().length > 0 && this.ctaLink().length > 0);
  readonly hasContent = computed(
    () => this.hasEyebrow() || this.hasTitle() || this.hasSubtitle() || this.hasCta(),
  );

  onCtaActivate(): void {
    if (!this.hasCta()) {
      return;
    }

    this.ctaactivate.emit({ href: this.ctaLink(), label: this.ctaLabel() });
  }
}
