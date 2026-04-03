import type { LinkBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LinkComponent, coerceConfigInput, resolveConfigValue } from '@synergos/shared';

type LinkTone = 'brand' | 'neutral' | 'inverse';

@Component({
  selector: 'sg-link-block',
  imports: [LinkComponent],
  templateUrl: './link-block.html',
  styleUrl: './link-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-link-block' },
})
export class LinkBlockComponent {
  readonly config = input<Partial<LinkBlockElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<LinkBlockElementConfig>,
  });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });

  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.config()?.href, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.config()?.target, '_self'),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly variant = computed(() => this.variantInput()?.trim() || 'default');

  readonly resolvedTone = computed<LinkTone>(() =>
    this.variant() === 'subtle' ? 'neutral' : 'brand',
  );
  readonly underline = computed(() => this.variant() !== 'subtle');
}
