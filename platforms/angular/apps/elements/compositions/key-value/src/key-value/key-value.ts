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
  readonly configInput = input<Partial<KeyValueElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<KeyValueElementConfig>,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly valueInput = input<string | undefined>(undefined, { alias: 'value' });
  readonly helpTextInput = input<string | undefined>(undefined, { alias: 'helpText' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.configInput()?.label, ''),
  );
  readonly value = computed(() =>
    resolveConfigValue(this.valueInput(), this.configInput()?.value, ''),
  );
  readonly helpText = computed(() =>
    resolveConfigValue(this.helpTextInput(), this.configInput()?.helpText, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
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
