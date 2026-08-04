import type { IconBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeIconBlockConfig(value: Partial<IconBlockElementConfig>): Partial<IconBlockElementConfig> {
  return omitUndefinedProperties<Partial<IconBlockElementConfig>>({
    icon: coerceTrimmedStringInput(value.icon),
    size: coerceTrimmedStringInput(value.size),
    color: coerceTrimmedStringInput(value.color),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    ariaHidden: coerceOptionalBooleanInput(value.ariaHidden),
  });
}

@Component({
  selector: 'sg-icon-block',
  imports: [],
  templateUrl: './icon-block.html',
  styleUrl: './icon-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-icon-block' },
})
export class IconBlockComponent {
  readonly config = input<Partial<IconBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<IconBlockElementConfig>>(sanitizeIconBlockConfig),
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly colorInput = input<string | undefined>(undefined, { alias: 'color' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly ariaHiddenInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'ariaHidden',
    transform: coerceOptionalBooleanInput,
  });

  readonly icon = computed(() => resolveConfigValue(this.iconInput()?.trim(), this.config()?.icon, ''));
  readonly size = computed(() => resolveConfigValue(this.sizeInput()?.trim(), this.config()?.size, 'md'));
  readonly color = computed(() => resolveConfigValue(this.colorInput()?.trim(), this.config()?.color, ''));
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  /**
   * DECORATIVO POR DEFECTO (issue #12).
   *
   * El default era `false` —o sea `role="img"`— y el spec afirmaba lo
   * contrario desde siempre. Convivieron en silencio porque los tests no
   * corrian (issue #1).
   *
   * Manda el spec, y por dos razones. La convencion: un icono suele acompanar
   * a un texto que ya dice lo mismo, asi que anunciarlo duplica; el default
   * seguro es callar y quien necesite que hable lo pide. Y una de este repo:
   * `Icon.cshtml` del CMS —que renderiza este mismo DocType SSR-nativo— ya
   * hacia `isDecorative = string.IsNullOrWhiteSpace(alt)`. Las dos mitades del
   * elemento decian cosas distintas; ahora dicen la misma.
   *
   * El fallback a `icon()` para el aria-label se queda: sirve cuando alguien
   * pide `ariaHidden="false"` sin etiqueta, y un `role="img"` SIN nombre
   * accesible es peor que uno con un nombre pobre.
   */
  readonly ariaHidden = computed(() => resolveConfigValue(this.ariaHiddenInput(), this.config()?.ariaHidden, true));

  readonly hostClasses = computed(() => `sg-icon-block--${this.size()}`);
}
