import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { HeroElementConfig } from '@synergos/contracts';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingLevel,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

const heroHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveHeroHeadingLevel(value: string): HeadingLevel {
  return heroHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h1';
}

@Component({
  selector: 'sg-hero',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-hero' },
})
export class HeroComponent {
  readonly configInput = input<Partial<HeroElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<HeroElementConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly headingLevelInput = input<string | undefined>(undefined, { alias: 'headingLevel' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly imageSrcInput = input<string | undefined>(undefined, { alias: 'imageSrc' });
  readonly imageAltInput = input<string | undefined>(undefined, { alias: 'imageAlt' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly ctaTargetInput = input<string | undefined>(undefined, { alias: 'ctaTarget' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly headingLevel = computed(() =>
    resolveConfigValue(this.headingLevelInput(), this.configInput()?.headingLevel, 'h1'),
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
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly resolvedHeadingLevel = computed<HeadingLevel>(() =>
    resolveHeroHeadingLevel(this.headingLevel()),
  );
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-hero--${this.variant()} sg-hero--${this.theme()}`,
  );
}
