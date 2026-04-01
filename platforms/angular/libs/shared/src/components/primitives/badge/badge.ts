import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '../../../utils/config-input.util';

type BadgeTone = 'neutral' | 'brand' | 'inverse';

export interface BadgeConfig {
  readonly text?: string;
  readonly ariaLabel?: string;
  readonly tone?: BadgeTone;
}

@Component({
  selector: 'syn-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-badge"
      [class.syn-badge--neutral]="tone() === 'neutral'"
      [class.syn-badge--brand]="tone() === 'brand'"
      [class.syn-badge--inverse]="tone() === 'inverse'"
      role="status"
      [attr.aria-label]="ariaLabel() || text()"
    >
      {{ text() }}
    </span>
  `,
  styleUrl: './badge.scss',
})
export class BadgeComponent {
  readonly configInput = input<Partial<BadgeConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<BadgeConfig>,
  });
  readonly textInput = input<string | undefined>(undefined, { alias: 'text' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly toneInput = input<BadgeTone | undefined>(undefined, { alias: 'tone' });

  readonly text = computed(() =>
    resolveConfigValue(this.textInput(), this.configInput()?.text, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.configInput()?.tone, 'neutral'),
  );
}
