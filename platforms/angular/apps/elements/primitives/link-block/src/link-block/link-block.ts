import type { LinkBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LinkComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

type LinkTone = 'brand' | 'neutral' | 'inverse';

function sanitizeLinkBlockConfig(value: Partial<LinkBlockElementConfig>): Partial<LinkBlockElementConfig> {
  return omitUndefinedProperties<Partial<LinkBlockElementConfig>>({
    href: coerceTrimmedStringInput(value.href),
    label: coerceTrimmedStringInput(value.label),
    target: coerceTrimmedStringInput(value.target),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    variant: coerceTrimmedStringInput(value.variant),
  });
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
  readonly config = input<Partial<LinkBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<LinkBlockElementConfig>>(sanitizeLinkBlockConfig),
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
  readonly variant = computed(() => resolveConfigValue(this.variantInput()?.trim(), this.config()?.variant, 'default'));

  readonly resolvedTone = computed<LinkTone>(() =>
    this.variant() === 'subtle' ? 'neutral' : 'brand',
  );
  readonly underline = computed(() => this.variant() !== 'subtle');
}
