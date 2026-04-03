import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AlertBarElementConfig } from '@synergos/contracts';
import {
  AlertComponent,
  LinkComponent,
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type AlertTone = 'neutral' | 'brand' | 'critical';

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
  readonly configInput = input<Partial<AlertBarElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<AlertBarElementConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly descriptionInput = input<string | undefined>(undefined, { alias: 'description' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  // variant maps to tone — CMS sends "variant", component resolves it as AlertTone
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
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
    resolveTone(resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'neutral')),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );
  readonly dismissible = computed(() =>
    resolveConfigValue(this.dismissibleInput(), this.configInput()?.dismissible, true),
  );
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hostClasses = computed(() => `sg-alert-bar--${this.theme()}`);
}
