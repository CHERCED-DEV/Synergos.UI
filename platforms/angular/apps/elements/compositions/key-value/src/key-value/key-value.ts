import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { KeyValueElementConfig } from '@synergos/contracts';
import {
  DescriptionListComponent,
  type DescriptionListItem,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

@Component({
  selector: 'sg-key-value',
  imports: [DescriptionListComponent],
  templateUrl: './key-value.html',
  styleUrl: './key-value.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-key-value' },
})
export class KeyValueElementComponent {
  readonly config = input<Partial<KeyValueElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<KeyValueElementConfig>,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly valueInput = input<string | undefined>(undefined, { alias: 'value' });
  readonly helpTextInput = input<string | undefined>(undefined, { alias: 'helpText' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly value = computed(() =>
    resolveConfigValue(this.valueInput(), this.config()?.value, ''),
  );
  readonly helpText = computed(() =>
    resolveConfigValue(this.helpTextInput(), this.config()?.helpText, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly items = computed<readonly DescriptionListItem[]>(() => {
    const helpText = this.helpText().trim();

    return [
      {
        term: this.label(),
        description: this.value(),
        ...(helpText ? { detail: helpText } : {}),
        emphasis: this.theme() === 'dark' ? 'brand' : 'default',
      },
    ];
  });

  readonly hostClasses = computed(() => `key-value--${this.theme()}`);
}
