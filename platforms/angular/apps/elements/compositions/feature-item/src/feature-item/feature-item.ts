import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface FeatureItemConfig {
  readonly icon?: string;
  readonly headingText?: string;
  readonly body?: string;
  readonly variant?: string;
  readonly theme?: string;
}

@Component({
  selector: 'sg-feature-item',
  imports: [],
  templateUrl: './feature-item.html',
  styleUrl: './feature-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-item' },
})
export class FeatureItemComponent {
  readonly configInput = input<Partial<FeatureItemConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FeatureItemConfig>,
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly icon = computed(() =>
    resolveConfigValue(this.iconInput(), this.configInput()?.icon, ''),
  );
  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hostClasses = computed(() => `sg-feature-item--${this.variant()} sg-feature-item--${this.theme()}`);
}
