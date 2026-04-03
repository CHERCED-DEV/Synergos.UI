import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ContainerBlockElementConfig } from '@synergos/contracts';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-container-block',
  imports: [],
  templateUrl: './container-block.html',
  styleUrl: './container-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-container-block' },
})
export class ContainerBlockComponent {
  readonly configInput = input<Partial<ContainerBlockElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ContainerBlockElementConfig>,
  });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly containerTypeInput = input<string | undefined>(undefined, { alias: 'containerType' });
  readonly maxWidthInput = input<string | undefined>(undefined, { alias: 'maxWidth' });
  readonly paddingInput = input<string | undefined>(undefined, { alias: 'padding' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.configInput()?.elementId, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly containerType = computed(() =>
    resolveConfigValue(this.containerTypeInput(), undefined, 'default'),
  );
  readonly maxWidth = computed(() =>
    resolveConfigValue(this.maxWidthInput(), undefined, ''),
  );
  readonly padding = computed(() =>
    resolveConfigValue(this.paddingInput(), undefined, 'md'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hostClasses = computed(() =>
    `sg-container-block--${this.containerType()} sg-container-block--${this.variant()} sg-container-block--pad-${this.padding()} sg-container-block--${this.theme()}`,
  );
}
