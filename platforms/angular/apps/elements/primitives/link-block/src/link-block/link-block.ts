import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LinkComponent, coerceConfigInput, resolveConfigValue } from '@synergos/shared';

type LinkTone = 'brand' | 'neutral' | 'inverse';

export interface LinkBlockConfig {
  readonly href?: string;
  readonly label?: string;
  readonly target?: string;
  readonly ariaLabel?: string;
  readonly variant?: string;
}

@Component({
  selector: 'sg-link-block',
  imports: [LinkComponent],
  templateUrl: './link-block.html',
  styleUrl: './link-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-link-block' },
})
export class LinkBlockComponent {
  readonly configInput = input<Partial<LinkBlockConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<LinkBlockConfig>,
  });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });

  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.configInput()?.href, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.configInput()?.label, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.configInput()?.target, '_self'),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );

  readonly resolvedTone = computed<LinkTone>(() =>
    this.variant() === 'subtle' ? 'neutral' : 'brand',
  );
  readonly underline = computed(() => this.variant() !== 'subtle');
}
