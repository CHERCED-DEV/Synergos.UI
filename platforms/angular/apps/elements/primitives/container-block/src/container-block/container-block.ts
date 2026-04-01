import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface ContainerBlockConfig {
  readonly elementId?: string;
  readonly ariaLabel?: string;
  readonly containerType?: string;
  readonly maxWidth?: string;
  readonly padding?: string;
  readonly theme?: string;
}

@Component({
  selector: 'sg-container-block',
  imports: [],
  templateUrl: './container-block.html',
  styleUrl: './container-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-container-block' },
})
export class ContainerBlockComponent {
  readonly configInput = input<Partial<ContainerBlockConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ContainerBlockConfig>,
  });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly containerTypeInput = input<string | undefined>(undefined, { alias: 'containerType' });
  readonly maxWidthInput = input<string | undefined>(undefined, { alias: 'maxWidth' });
  readonly paddingInput = input<string | undefined>(undefined, { alias: 'padding' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.configInput()?.elementId, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly containerType = computed(() =>
    resolveConfigValue(this.containerTypeInput(), this.configInput()?.containerType, 'default'),
  );
  readonly maxWidth = computed(() =>
    resolveConfigValue(this.maxWidthInput(), this.configInput()?.maxWidth, ''),
  );
  readonly padding = computed(() =>
    resolveConfigValue(this.paddingInput(), this.configInput()?.padding, 'md'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly hostClasses = computed(() =>
    `sg-container-block--${this.containerType()} sg-container-block--pad-${this.padding()} sg-container-block--${this.theme()}`,
  );
}
