import type { IconBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeIconBlockConfig(value: Partial<IconBlockElementConfig>): Partial<IconBlockElementConfig> {
  return omitUndefinedProperties<Partial<IconBlockElementConfig>>({
    icon: coerceTrimmedStringInput(value.icon),
    size: coerceTrimmedStringInput(value.size),
    color: coerceTrimmedStringInput(value.color),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    ariaHidden: coerceOptionalBooleanInput(value.ariaHidden),
  });
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
  readonly config = input<Partial<IconBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<IconBlockElementConfig>>(sanitizeIconBlockConfig),
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly colorInput = input<string | undefined>(undefined, { alias: 'color' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly ariaHiddenInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'ariaHidden',
    transform: coerceOptionalBooleanInput,
  });

  readonly icon = computed(() => resolveConfigValue(this.iconInput()?.trim(), this.config()?.icon, ''));
  readonly size = computed(() => resolveConfigValue(this.sizeInput()?.trim(), this.config()?.size, 'md'));
  readonly color = computed(() => resolveConfigValue(this.colorInput()?.trim(), this.config()?.color, ''));
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly ariaHidden = computed(() => resolveConfigValue(this.ariaHiddenInput(), this.config()?.ariaHidden, false));

  readonly hostClasses = computed(() => `sg-icon-block--${this.size()}`);
}
