import type { CardElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BadgeComponent,
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

@Component({
  selector: 'sg-card',
  imports: [BadgeComponent, ButtonComponent, HeadingComponent],
  templateUrl: './card.html',
  styleUrl: './card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-card' },
})
export class CardComponent {
  readonly config = input<Partial<CardElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<CardElementConfig>,
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
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.config()?.subtitle, ''),
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
  readonly badgeText = computed(() =>
    resolveConfigValue(this.badgeTextInput(), this.config()?.badgeText, ''),
  );
  readonly badgeType = computed(() =>
    resolveConfigValue(this.badgeTypeInput(), this.config()?.badgeType, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hasBadge = computed(() => this.badgeText().trim().length > 0);
  readonly badgeTone = computed(() => (this.badgeType() === 'info' ? 'brand' : 'neutral'));
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-card--${this.variant()} sg-card--${this.theme()}`,
  );
}
