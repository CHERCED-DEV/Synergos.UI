import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/vitals-core/inputs';
import { trazosDeIcono } from './icon-set';

export type IconSize = 'sm' | 'md' | 'lg';
export type IconTone = 'neutral' | 'brand' | 'inverse';

export interface IconConfig {
  readonly name?: string;
  readonly symbol?: string;
  readonly label?: string;
  readonly size?: IconSize;
  readonly tone?: IconTone;
  readonly decorative?: boolean;
}

function sanitizeIconConfig(value: Partial<IconConfig>): Partial<IconConfig> {
  return omitUndefinedProperties<IconConfig>({
    name: coerceTrimmedStringInput(value.name),
    symbol: coerceTrimmedStringInput(value.symbol),
    label: coerceTrimmedStringInput(value.label),
    size: coerceStringEnumInput(value.size, ['sm', 'md', 'lg'] as const),
    tone: coerceStringEnumInput(value.tone, ['neutral', 'brand', 'inverse'] as const),
    decorative: coerceOptionalBooleanInput(value.decorative),
  });
}

@Component({
  selector: 'syn-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-icon"
      [class]="iconClass()"
      [attr.role]="decorative() ? null : 'img'"
      [attr.aria-label]="decorative() ? null : label() || name() || symbol() || null"
      [attr.aria-hidden]="decorative() ? 'true' : null"
    >
      @if (trazos(); as trazos) {
        <svg
          class="syn-icon__svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          @for (d of trazos; track $index) {
            <path [attr.d]="d" />
          }
        </svg>
      } @else {
        {{ symbol() }}
      }
    </span>
  `,
  styleUrl: './icon.scss',
})
export class IconComponent {
  readonly config = input<Partial<IconConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<IconConfig>(sanitizeIconConfig),
  });
  readonly nameInput = input<string | undefined>(undefined, { alias: 'name' });
  readonly symbolInput = input<string | undefined>(undefined, { alias: 'symbol' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly sizeInput = input<IconSize | undefined>(undefined, { alias: 'size' });
  readonly toneInput = input<IconTone | undefined>(undefined, { alias: 'tone' });
  readonly decorativeInput = input<boolean | undefined>(undefined, { alias: 'decorative' });

  readonly name = computed(() =>
    resolveConfigValue(this.nameInput(), this.config()?.name, ''),
  );
  readonly symbol = computed(() =>
    resolveConfigValue(this.symbolInput(), this.config()?.symbol, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'neutral'),
  );
  readonly decorative = computed(() =>
    resolveConfigValue(this.decorativeInput(), this.config()?.decorative, true),
  );

  /**
   * Los trazos del icono del set por su nombre (UI#89). Un nombre que el set no tiene NO se pinta
   * como palabra —«check Envío gratis…»—: cae al glifo de `symbol`, y sin glifo no hay nada.
   */
  readonly trazos = computed(() => trazosDeIcono(this.name()));

  iconClass(): string {
    return classNames('syn-icon', `syn-icon--${this.size()}`, `syn-icon--${this.tone()}`);
  }
}
