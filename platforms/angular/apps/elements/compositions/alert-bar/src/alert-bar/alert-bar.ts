import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  AlertComponent,
  LinkComponent,
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type AlertTone = 'neutral' | 'brand' | 'critical';

export interface AlertBarConfig {
  readonly title?: string;
  readonly description?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly tone?: AlertTone | string;
  readonly dismissible?: boolean;
}

function resolveTone(value: string | undefined): AlertTone {
  return value === 'brand' || value === 'critical' ? value : 'neutral';
}

@Component({
  selector: 'sg-alert-bar',
  imports: [AlertComponent, LinkComponent],
  templateUrl: './alert-bar.html',
  styleUrl: './alert-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-alert-bar' },
})
export class AlertBarElementComponent {
  readonly configInput = input<Partial<AlertBarConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<AlertBarConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly descriptionInput = input<string | undefined>(undefined, { alias: 'description' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly toneInput = input<string | undefined>(undefined, { alias: 'tone' });
  readonly dismissibleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'dismissible',
    transform: coerceOptionalBooleanInput,
  });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly description = computed(() =>
    resolveConfigValue(this.descriptionInput(), this.configInput()?.description, ''),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.configInput()?.ctaLabel, ''),
  );
  readonly ctaUrl = computed(() =>
    resolveConfigValue(this.ctaUrlInput(), this.configInput()?.ctaUrl, ''),
  );
  readonly tone = computed<AlertTone>(() =>
    resolveTone(resolveConfigValue(this.toneInput(), this.configInput()?.tone, 'neutral')),
  );
  readonly dismissible = computed(() =>
    resolveConfigValue(this.dismissibleInput(), this.configInput()?.dismissible, true),
  );
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
}
