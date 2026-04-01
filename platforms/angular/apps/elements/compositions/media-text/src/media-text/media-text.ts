import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface MediaTextConfig {
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly headingText?: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly mediaPosition?: string;
  readonly theme?: string;
}

@Component({
  selector: 'sg-media-text',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './media-text.html',
  styleUrl: './media-text.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-media-text' },
})
export class MediaTextComponent {
  readonly configInput = input<Partial<MediaTextConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<MediaTextConfig>,
  });
  readonly imageSrcInput = input<string | undefined>(undefined, { alias: 'imageSrc' });
  readonly imageAltInput = input<string | undefined>(undefined, { alias: 'imageAlt' });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly mediaPositionInput = input<string | undefined>(undefined, { alias: 'mediaPosition' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly imageSrc = computed(() =>
    resolveConfigValue(this.imageSrcInput(), this.configInput()?.imageSrc, ''),
  );
  readonly imageAlt = computed(() =>
    resolveConfigValue(this.imageAltInput(), this.configInput()?.imageAlt, ''),
  );
  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.configInput()?.ctaLabel, ''),
  );
  readonly ctaUrl = computed(() =>
    resolveConfigValue(this.ctaUrlInput(), this.configInput()?.ctaUrl, ''),
  );
  readonly mediaPosition = computed(() =>
    resolveConfigValue(this.mediaPositionInput(), this.configInput()?.mediaPosition, 'left'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-media-text--${this.mediaPosition()} sg-media-text--${this.theme()}`,
  );
}
