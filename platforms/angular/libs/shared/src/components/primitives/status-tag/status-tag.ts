import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '../../../utils/config-input.util';

export type StatusTagStyle = 'outline' | 'filled';
export type StatusTagTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'critical'
  | 'pending'
  | 'inactive'
  | 'blocked';

export interface StatusTagConfig {
  readonly label?: string;
  readonly tone?: StatusTagTone;
  readonly style?: StatusTagStyle;
}

function sanitizeStatusTagConfig(value: Partial<StatusTagConfig>): Partial<StatusTagConfig> {
  return omitUndefinedProperties<StatusTagConfig>({
    label: coerceTrimmedStringInput(value.label),
    tone: coerceStringEnumInput(
      value.tone,
      ['neutral', 'success', 'warning', 'critical', 'pending', 'inactive', 'blocked'] as const,
    ),
    style: coerceStringEnumInput(value.style, ['outline', 'filled'] as const),
  });
}

@Component({
  selector: 'syn-status-tag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="syn-status-tag" [class]="tagClass()" role="status">
      {{ label() }}
    </span>
  `,
  styleUrl: './status-tag.scss',
})
export class StatusTagComponent {
  readonly config = input<Partial<StatusTagConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<StatusTagConfig>(sanitizeStatusTagConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly toneInput = input<StatusTagTone | undefined>(undefined, { alias: 'tone' });
  readonly styleInput = input<StatusTagStyle | undefined>(undefined, { alias: 'style' });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'neutral'),
  );
  readonly style = computed(() =>
    resolveConfigValue(this.styleInput(), this.config()?.style, 'outline'),
  );

  tagClass(): string {
    return classNames(
      'syn-status-tag',
      `syn-status-tag--${this.tone()}`,
      `syn-status-tag--${this.style()}`,
    );
  }
}
