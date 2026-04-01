import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BadgeComponent,
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface CardConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly body?: string;
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly badgeText?: string;
  readonly badgeType?: string;
  readonly variant?: string;
  readonly theme?: string;
}

@Component({
  selector: 'sg-card',
  imports: [BadgeComponent, ButtonComponent, HeadingComponent],
  templateUrl: './card.html',
  styleUrl: './card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-card' },
})
export class CardComponent {
  readonly configInput = input<Partial<CardConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<CardConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly subtitleInput = input<string | undefined>(undefined, { alias: 'subtitle' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly imageSrcInput = input<string | undefined>(undefined, { alias: 'imageSrc' });
  readonly imageAltInput = input<string | undefined>(undefined, { alias: 'imageAlt' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly badgeTextInput = input<string | undefined>(undefined, { alias: 'badgeText' });
  readonly badgeTypeInput = input<string | undefined>(undefined, { alias: 'badgeType' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.configInput()?.subtitle, ''),
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
  readonly badgeText = computed(() =>
    resolveConfigValue(this.badgeTextInput(), this.configInput()?.badgeText, ''),
  );
  readonly badgeType = computed(() =>
    resolveConfigValue(this.badgeTypeInput(), this.configInput()?.badgeType, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hasBadge = computed(() => this.badgeText().trim().length > 0);
  readonly badgeTone = computed(() => (this.badgeType() === 'info' ? 'brand' : 'neutral'));
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-card--${this.variant()} sg-card--${this.theme()}`,
  );
}
