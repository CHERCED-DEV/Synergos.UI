import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BannerElementConfig } from '@synergos/contracts';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

function sanitizeBannerConfig(value: Partial<BannerElementConfig>): Partial<BannerElementConfig> {
  return omitUndefinedProperties<Partial<BannerElementConfig>>({
    eyebrow: coerceTrimmedStringInput(value.eyebrow),
    title: coerceTrimmedStringInput(value.title),
    body: coerceTrimmedStringInput(value.body),
    imageSrc: coerceTrimmedStringInput(value.imageSrc),
    imageAlt: coerceTrimmedStringInput(value.imageAlt),
    ctaLabel: coerceTrimmedStringInput(value.ctaLabel),
    ctaUrl: coerceTrimmedStringInput(value.ctaUrl),
    ctaTarget: coerceTrimmedStringInput(value.ctaTarget),
    secondaryCtaLabel: coerceTrimmedStringInput(value.secondaryCtaLabel),
    secondaryCtaUrl: coerceTrimmedStringInput(value.secondaryCtaUrl),
    secondaryCtaTarget: coerceTrimmedStringInput(value.secondaryCtaTarget),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-banner',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './banner.html',
  styleUrl: './banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-banner' },
})
export class BannerComponent {
  readonly config = input<Partial<BannerElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<BannerElementConfig>>(sanitizeBannerConfig),
  });
  readonly eyebrowInput = input<string | undefined>(undefined, { alias: 'eyebrow' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly imageSrcInput = input<string | undefined>(undefined, { alias: 'imageSrc' });
  readonly imageAltInput = input<string | undefined>(undefined, { alias: 'imageAlt' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly ctaTargetInput = input<string | undefined>(undefined, { alias: 'ctaTarget' });
  readonly secondaryCtaLabelInput = input<string | undefined>(undefined, { alias: 'secondaryCtaLabel' });
  readonly secondaryCtaUrlInput = input<string | undefined>(undefined, { alias: 'secondaryCtaUrl' });
  readonly secondaryCtaTargetInput = input<string | undefined>(undefined, { alias: 'secondaryCtaTarget' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly eyebrow = computed(() =>
    resolveConfigValue(this.eyebrowInput(), this.config()?.eyebrow, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.config()?.body, ''),
  );
  readonly imageSrc = computed(() =>
    resolveConfigValue(this.imageSrcInput(), this.config()?.imageSrc, ''),
  );
  readonly imageAlt = computed(() =>
    resolveConfigValue(this.imageAltInput(), this.config()?.imageAlt, ''),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.config()?.ctaLabel, ''),
  );
  readonly ctaUrl = computed(() =>
    resolveConfigValue(this.ctaUrlInput(), this.config()?.ctaUrl, ''),
  );
  readonly ctaTarget = computed(() =>
    resolveConfigValue(this.ctaTargetInput(), this.config()?.ctaTarget, '_self'),
  );
  readonly secondaryCtaLabel = computed(() =>
    resolveConfigValue(this.secondaryCtaLabelInput(), this.config()?.secondaryCtaLabel, ''),
  );
  readonly secondaryCtaUrl = computed(() =>
    resolveConfigValue(this.secondaryCtaUrlInput(), this.config()?.secondaryCtaUrl, ''),
  );
  readonly secondaryCtaTarget = computed(() =>
    resolveConfigValue(this.secondaryCtaTargetInput(), this.config()?.secondaryCtaTarget, '_self'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hasSecondaryCta = computed(() => this.secondaryCtaLabel().trim().length > 0 && this.secondaryCtaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-banner--${this.variant()} sg-banner--${this.theme()}${this.hasImage() ? ' sg-banner--with-image' : ''}`,
  );
}
