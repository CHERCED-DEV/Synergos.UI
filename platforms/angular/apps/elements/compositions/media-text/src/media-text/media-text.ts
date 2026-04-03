import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MediaTextElementConfig } from '@synergos/contracts';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

@Component({
  selector: 'sg-media-text',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './media-text.html',
  styleUrl: './media-text.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-media-text' },
})
export class MediaTextComponent {
  readonly config = input<Partial<MediaTextElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<MediaTextElementConfig>,
  });
  readonly imageSrcInput = input<string | undefined>(undefined, { alias: 'imageSrc' });
  readonly imageAltInput = input<string | undefined>(undefined, { alias: 'imageAlt' });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly ctaTargetInput = input<string | undefined>(undefined, { alias: 'ctaTarget' });
  readonly mediaPositionInput = input<string | undefined>(undefined, { alias: 'mediaPosition' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly imageSrc = computed(() =>
    resolveConfigValue(this.imageSrcInput(), this.config()?.imageSrc, ''),
  );
  readonly imageAlt = computed(() =>
    resolveConfigValue(this.imageAltInput(), this.config()?.imageAlt, ''),
  );
  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.config()?.body, ''),
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
  readonly mediaPosition = computed(() =>
    resolveConfigValue(this.mediaPositionInput(), this.config()?.mediaPosition, 'left'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-media-text--${this.mediaPosition()} sg-media-text--${this.variant()} sg-media-text--${this.theme()}`,
  );
}
