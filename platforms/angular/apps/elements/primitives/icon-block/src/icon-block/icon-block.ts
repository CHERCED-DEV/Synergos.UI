import type { IconBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

@Component({
  selector: 'sg-icon-block',
  imports: [],
  templateUrl: './icon-block.html',
  styleUrl: './icon-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-icon-block' },
})
export class IconBlockComponent {
  readonly config = input<Partial<IconBlockElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<IconBlockElementConfig>,
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly colorInput = input<string | undefined>(undefined, { alias: 'color' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly ariaHiddenInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'ariaHidden',
    transform: coerceOptionalBooleanInput,
  });

  readonly icon = computed(() => this.iconInput()?.trim() || '');
  readonly size = computed(() => this.sizeInput()?.trim() || 'md');
  readonly color = computed(() => this.colorInput()?.trim() || '');
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly ariaHidden = computed(() => this.ariaHiddenInput() ?? false);

  readonly hostClasses = computed(() => `sg-icon-block--${this.size()}`);
}
