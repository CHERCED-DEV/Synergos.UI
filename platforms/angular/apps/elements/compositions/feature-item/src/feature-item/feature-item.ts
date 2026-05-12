import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FeatureItemElementConfig } from '@synergos/contracts';
import {
  HeadingComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

function sanitizeFeatureItemConfig(
  value: Partial<FeatureItemElementConfig>,
): Partial<FeatureItemElementConfig> {
  return omitUndefinedProperties<FeatureItemElementConfig>({
    icon: coerceTrimmedStringInput(value.icon),
    headingText: coerceTrimmedStringInput(value.headingText),
    body: coerceTrimmedStringInput(value.body),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-feature-item',
  imports: [HeadingComponent],
  templateUrl: './feature-item.html',
  styleUrl: './feature-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-item' },
})
export class FeatureItemComponent {
  readonly config = input<Partial<FeatureItemElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FeatureItemElementConfig>(sanitizeFeatureItemConfig),
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly icon = computed(() =>
    resolveConfigValue(this.iconInput(), this.config()?.icon, ''),
  );
  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.config()?.body, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly headingTone = computed(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(() => `sg-feature-item--${this.variant()} sg-feature-item--${this.theme()}`);
}
