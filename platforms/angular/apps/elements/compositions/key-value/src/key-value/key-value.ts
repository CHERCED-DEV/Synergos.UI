import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  DescriptionListComponent,
  type DescriptionListItem,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface KeyValueConfig {
  readonly label?: string;
  readonly value?: string;
  readonly helpText?: string;
  readonly theme?: string;
}

@Component({
  selector: 'sg-key-value',
  standalone: true,
  imports: [DescriptionListComponent],
  templateUrl: './key-value.html',
  styleUrl: './key-value.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-key-value' },
})
export class KeyValueElementComponent {
  readonly configInput = input<Partial<KeyValueConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<KeyValueConfig>,
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
