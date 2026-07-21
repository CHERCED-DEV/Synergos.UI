import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { InfoBlockElementConfig } from '@synergos/contracts';
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

function sanitizeInfoBlockConfig(
  value: Partial<InfoBlockElementConfig>,
): Partial<InfoBlockElementConfig> {
  return omitUndefinedProperties<InfoBlockElementConfig>({
    title: coerceTrimmedStringInput(value.title),
    body: coerceTrimmedStringInput(value.body),
    ctaLabel: coerceTrimmedStringInput(value.ctaLabel),
    ctaUrl: coerceTrimmedStringInput(value.ctaUrl),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-info-block',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './info-block.html',
  styleUrl: './info-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-info-block' },
})
export class InfoBlockComponent {
  readonly config = input<Partial<InfoBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<InfoBlockElementConfig>(sanitizeInfoBlockConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
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
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-info-block--${this.variant()} sg-info-block--${this.theme()}`,
  );
}
