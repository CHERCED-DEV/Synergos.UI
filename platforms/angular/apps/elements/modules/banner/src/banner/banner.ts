import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface BannerConfig {
  readonly eyebrow?: string;
  readonly title?: string;
  readonly body?: string;
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly ctaTarget?: string;
  readonly secondaryCtaLabel?: string;
  readonly secondaryCtaUrl?: string;
  readonly secondaryCtaTarget?: string;
  readonly variant?: string;
  readonly theme?: string;
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
  readonly configInput = input<Partial<BannerConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<BannerConfig>,
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
    resolveConfigValue(this.eyebrowInput(), this.configInput()?.eyebrow, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly imageSrc = computed(() =>
    resolveConfigValue(this.imageSrcInput(), this.configInput()?.imageSrc, ''),
  );
  readonly imageAlt = computed(() =>
    resolveConfigValue(this.imageAltInput(), this.configInput()?.imageAlt, ''),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.configInput()?.ctaLabel, ''),
  );
  readonly ctaUrl = computed(() =>
    resolveConfigValue(this.ctaUrlInput(), this.configInput()?.ctaUrl, ''),
  );
  readonly ctaTarget = computed(() =>
    resolveConfigValue(this.ctaTargetInput(), this.configInput()?.ctaTarget, '_self'),
  );
  readonly secondaryCtaLabel = computed(() =>
    resolveConfigValue(this.secondaryCtaLabelInput(), this.configInput()?.secondaryCtaLabel, ''),
  );
  readonly secondaryCtaUrl = computed(() =>
    resolveConfigValue(this.secondaryCtaUrlInput(), this.configInput()?.secondaryCtaUrl, ''),
  );
  readonly secondaryCtaTarget = computed(() =>
    resolveConfigValue(this.secondaryCtaTargetInput(), this.configInput()?.secondaryCtaTarget, '_self'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hasSecondaryCta = computed(() => this.secondaryCtaLabel().trim().length > 0 && this.secondaryCtaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-banner--${this.variant()} sg-banner--${this.theme()}${this.hasImage() ? ' sg-banner--with-image' : ''}`,
  );
}
