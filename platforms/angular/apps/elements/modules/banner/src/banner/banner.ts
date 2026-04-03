import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BannerElementConfig } from '@synergos/contracts';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

@Component({
  selector: 'sg-banner',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './banner.html',
  styleUrl: './banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-banner' },
})
export class BannerComponent {
  readonly configInput = input<Partial<BannerElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<BannerElementConfig>,
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
    resolveConfigValue(this.eyebrowInput(), undefined, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly imageSrc = computed(() =>
    resolveConfigValue(this.imageSrcInput(), undefined, ''),
  );
  readonly imageAlt = computed(() =>
    resolveConfigValue(this.imageAltInput(), undefined, ''),
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
    resolveConfigValue(this.secondaryCtaLabelInput(), undefined, ''),
  );
  readonly secondaryCtaUrl = computed(() =>
    resolveConfigValue(this.secondaryCtaUrlInput(), undefined, ''),
  );
  readonly secondaryCtaTarget = computed(() =>
    resolveConfigValue(this.secondaryCtaTargetInput(), undefined, '_self'),
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
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-banner--${this.variant()} sg-banner--${this.theme()}${this.hasImage() ? ' sg-banner--with-image' : ''}`,
  );
}
