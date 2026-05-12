import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AlertBarElementConfig, ComponentTranslations } from '@synergos/contracts';
import {
  AlertComponent,
  LinkComponent,
  coerceOptionalBooleanInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

type AlertTone = 'neutral' | 'brand' | 'critical';

type AlertBarConfig = Partial<AlertBarElementConfig> & {
  readonly tone?: string;
};

function resolveTone(value: string | undefined): AlertTone {
  return value === 'brand' || value === 'critical' ? value : 'neutral';
}

function sanitizeAlertBarConfig(
  value: AlertBarConfig,
): AlertBarConfig {
  return omitUndefinedProperties<AlertBarConfig>({
    title: coerceTrimmedStringInput(value.title),
    description: coerceTrimmedStringInput(value.description),
    ctaLabel: coerceTrimmedStringInput(value.ctaLabel),
    ctaUrl: coerceTrimmedStringInput(value.ctaUrl),
    variant: coerceTrimmedStringInput(value.variant),
    tone: coerceTrimmedStringInput(value.tone),
    theme: coerceTrimmedStringInput(value.theme),
    dismissible: coerceOptionalBooleanInput(value.dismissible),
    translations: coerceStringRecordInput(value.translations),
  });
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
  readonly config = input<AlertBarConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AlertBarConfig>(sanitizeAlertBarConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly descriptionInput = input<string | undefined>(undefined, { alias: 'description' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly ctaUrlInput = input<string | undefined>(undefined, { alias: 'ctaUrl' });
  readonly toneInput = input<string | undefined>(undefined, { alias: 'tone' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly dismissibleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'dismissible',
    transform: coerceOptionalBooleanInput,
  });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly description = computed(() =>
    resolveConfigValue(this.descriptionInput(), this.config()?.description, ''),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.config()?.ctaLabel, ''),
  );
  readonly ctaUrl = computed(() =>
    resolveConfigValue(this.ctaUrlInput(), this.config()?.ctaUrl, ''),
  );
  readonly tone = computed<AlertTone>(() => {
    const directTone = resolveConfigValue(this.toneInput(), this.config()?.tone, '');
    if (directTone) {
      return resolveTone(directTone);
    }

    return resolveTone(resolveConfigValue(this.variantInput(), this.config()?.variant, 'neutral'));
  });
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly dismissible = computed(() =>
    resolveConfigValue(this.dismissibleInput(), this.config()?.dismissible, true),
  );
  readonly translations = computed<ComponentTranslations>(() => this.config()?.translations ?? {});
  readonly ctaAriaLabel = computed(() => this.translations()['ctaAriaLabel'] ?? this.ctaLabel());
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hostClasses = computed(() => `alert-bar--${this.theme()} alert-bar--${this.tone()} sg-alert-bar--${this.theme()}`);
}
