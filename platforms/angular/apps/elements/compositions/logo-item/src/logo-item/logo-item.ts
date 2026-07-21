import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LogoItemElementConfig } from '@synergos/contracts';
import {
  LinkComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeLogoItemConfig(
  value: Partial<LogoItemElementConfig>,
): Partial<LogoItemElementConfig> {
  return omitUndefinedProperties<LogoItemElementConfig>({
    src: coerceTrimmedStringInput(value.src),
    alt: coerceTrimmedStringInput(value.alt),
    href: coerceTrimmedStringInput(value.href),
    label: coerceTrimmedStringInput(value.label),
    target: coerceTrimmedStringInput(value.target),
  });
}

@Component({
  selector: 'sg-logo-item',
  imports: [LinkComponent],
  templateUrl: './logo-item.html',
  styleUrl: './logo-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-logo-item' },
})
export class LogoItemElementComponent {
  readonly config = input<Partial<LogoItemElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<LogoItemElementConfig>(sanitizeLogoItemConfig),
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.config()?.src, ''),
  );
  readonly alt = computed(() =>
    resolveConfigValue(this.altInput(), this.config()?.alt, ''),
  );
  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.config()?.href, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.config()?.target, '_self'),
  );
  readonly hasHref = computed(() => this.href().trim().length > 0);
  readonly hasImage = computed(() => this.src().trim().length > 0);
  readonly resolvedAlt = computed(() => this.alt().trim() || this.label().trim() || 'Brand logo');
  readonly resolvedAriaLabel = computed(() =>
    this.label().trim() || this.alt().trim() || 'Brand logo',
  );
}
