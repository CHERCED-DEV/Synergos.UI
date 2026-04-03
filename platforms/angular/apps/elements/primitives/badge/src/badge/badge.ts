import type { BadgeElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BadgeComponent as SynBadgeComponent,
  type BadgeConfig,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

type BadgeTone = NonNullable<BadgeConfig['tone']>;

@Component({
  selector: 'sg-badge',
  imports: [SynBadgeComponent],
  templateUrl: './badge.html',
  styleUrl: './badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-badge' },
})
export class BadgeElementComponent {
  readonly configInput = input<Partial<BadgeElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<BadgeElementConfig>,
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
  readonly tone = computed<BadgeTone>(() =>
    resolveConfigValue(this.toneInput(), this.configInput()?.tone, 'neutral') as BadgeTone,
  );
}
