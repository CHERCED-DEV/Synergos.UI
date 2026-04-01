import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface IconBlockConfig {
  readonly icon?: string;
  readonly size?: string;
  readonly color?: string;
  readonly ariaLabel?: string;
  readonly ariaHidden?: boolean;
}

@Component({
  selector: 'sg-icon-block',
  imports: [],
  templateUrl: './icon-block.html',
  styleUrl: './icon-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-icon-block' },
})
export class IconBlockComponent {
  readonly configInput = input<Partial<IconBlockConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<IconBlockConfig>,
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly colorInput = input<string | undefined>(undefined, { alias: 'color' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly ariaHiddenInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'ariaHidden',
    transform: coerceOptionalBooleanInput,
  });

  readonly icon = computed(() =>
    resolveConfigValue(this.iconInput(), this.configInput()?.icon, ''),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.configInput()?.size, 'md'),
  );
  readonly color = computed(() =>
    resolveConfigValue(this.colorInput(), this.configInput()?.color, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly ariaHidden = computed(() =>
    resolveConfigValue(this.ariaHiddenInput(), this.configInput()?.ariaHidden, false),
  );

  readonly hostClasses = computed(() => `sg-icon-block--${this.size()}`);
}
