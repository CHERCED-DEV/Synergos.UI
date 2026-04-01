import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LinkComponent, coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface LogoItemConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly href?: string;
  readonly label?: string;
  readonly target?: string;
}

@Component({
  selector: 'sg-logo-item',
  standalone: true,
  imports: [LinkComponent],
  templateUrl: './logo-item.html',
  styleUrl: './logo-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-logo-item' },
})
export class LogoItemElementComponent {
  readonly configInput = input<Partial<LogoItemConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<LogoItemConfig>,
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.configInput()?.src, ''),
  );
  readonly alt = computed(() =>
    resolveConfigValue(this.altInput(), this.configInput()?.alt, ''),
  );
  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.configInput()?.href, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.configInput()?.label, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.configInput()?.target, '_self'),
  );
  readonly hasHref = computed(() => this.href().trim().length > 0);
  readonly hasImage = computed(() => this.src().trim().length > 0);
  readonly resolvedAlt = computed(() => this.alt().trim() || this.label().trim() || 'Brand logo');
  readonly resolvedAriaLabel = computed(() =>
    this.label().trim() || this.alt().trim() || 'Brand logo',
  );
}
