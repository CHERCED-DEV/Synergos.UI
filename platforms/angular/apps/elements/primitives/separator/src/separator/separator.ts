import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SeparatorProps } from '@synergos/contracts';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSeparator</c>.
 *
 * A thematic divider that splits content either horizontally (a rule across the
 * block) or vertically (a rule between inline items). An optional `label` can be
 * centered inside a horizontal rule (e.g. "o", "Más reciente"); when present the
 * line is drawn on both sides of the text.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 *
 * El `config` que manda el CMS tiene la forma de `SeparatorProps`, GENERADO del record C#
 * (ADR 0135): `style`, el trazo de la línea (CMS#192, caso 2). Antes el editor lo elegía y el
 * elemento pintaba siempre la línea continua. `orientation`, `label`, `labelAlign` y
 * `decorative` no los autora el editor: siguen siendo atributos, y el `config` libre los lee.
 */
export type SeparatorOrientation = 'horizontal' | 'vertical';
export type SeparatorLabelAlign = 'start' | 'center' | 'end';
/** El trazo: los cinco de `DTSelectSeparatorStyle`, tal como viajan. */
export type SeparatorStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'gradient';

export interface SeparatorRuntimeConfig {
  readonly orientation?: SeparatorOrientation;
  readonly label?: string;
  readonly labelAlign?: SeparatorLabelAlign;
  readonly decorative?: boolean;
}

/** Lo que llega en `config`: el record del CMS más los atributos que el JSON libre puede traer. */
export type SeparatorConfig = Partial<SeparatorProps> & SeparatorRuntimeConfig;

const ORIENTATIONS: readonly SeparatorOrientation[] = ['horizontal', 'vertical'];
const LABEL_ALIGNS: readonly SeparatorLabelAlign[] = ['start', 'center', 'end'];
const STYLES: readonly SeparatorStyle[] = ['solid', 'dashed', 'dotted', 'double', 'gradient'];

const DEFAULT_ORIENTATION: SeparatorOrientation = 'horizontal';
const DEFAULT_LABEL_ALIGN: SeparatorLabelAlign = 'center';
const DEFAULT_STYLE: SeparatorStyle = 'solid';

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeSeparatorConfig(value: SeparatorConfig): SeparatorConfig {
  return omitUndefinedProperties<SeparatorConfig>({
    style: coerceStringEnumInput(value.style, STYLES),
    orientation: coerceStringEnumInput(value.orientation, ORIENTATIONS),
    label: coerceTrimmedStringInput(value.label),
    labelAlign: coerceStringEnumInput(value.labelAlign, LABEL_ALIGNS),
    decorative: coerceOptionalBooleanInput(value.decorative),
  });
}

@Component({
  selector: 'sg-separator',
  standalone: true,
  templateUrl: './separator.html',
  styleUrl: './separator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-separator',
    '[attr.data-orientation]': 'orientation()',
    '[attr.data-style]': 'lineStyle()',
    '[attr.data-has-label]': 'hasLabel() ? "" : null',
  },
})
export class SeparatorElementComponent {
  readonly config = input<SeparatorConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SeparatorConfig>(sanitizeSeparatorConfig),
  });
  readonly styleInput = input<string | undefined>(undefined, { alias: 'lineStyle' });
  readonly orientationInput = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly labelAlignInput = input<string | undefined>(undefined, { alias: 'labelAlign' });
  readonly decorativeInput = input<string | boolean | undefined>(undefined, { alias: 'decorative' });
  readonly integration = input<string | undefined>(undefined);

  /** Resolved orientation: horizontal (default) or vertical. */
  readonly orientation = computed<SeparatorOrientation>(() =>
    resolveConfigValue(
      coerceStringEnumInput(this.orientationInput(), ORIENTATIONS),
      this.config()?.orientation,
      DEFAULT_ORIENTATION,
    ),
  );

  /** Optional centered label; '' when none. Ignored on vertical rules. */
  readonly label = computed<string>(() => {
    if (this.orientation() === 'vertical') {
      return '';
    }
    return resolveConfigValue(
      coerceTrimmedStringInput(this.labelInput()),
      this.config()?.label,
      '',
    );
  });

  readonly hasLabel = computed(() => this.label().length > 0);

  /**
   * El trazo de la línea. El atributo es `line-style` y no `style`: `style` en el tag es el
   * atributo de estilos en línea del navegador, y Angular no lo deja como alias.
   */
  readonly lineStyle = computed<SeparatorStyle>(() =>
    resolveConfigValue(
      coerceStringEnumInput(this.styleInput(), STYLES),
      this.config()?.style as SeparatorStyle | undefined,
      DEFAULT_STYLE,
    ),
  );

  /** Where the label sits along a horizontal rule. */
  readonly labelAlign = computed<SeparatorLabelAlign>(() =>
    resolveConfigValue(
      coerceStringEnumInput(this.labelAlignInput(), LABEL_ALIGNS),
      this.config()?.labelAlign,
      DEFAULT_LABEL_ALIGN,
    ),
  );

  /**
   * Decorative rules are hidden from assistive tech (`role="none"`); semantic
   * rules expose `role="separator"` with the proper `aria-orientation`. A
   * labelled rule is always semantic so the label text is announced.
   */
  readonly decorative = computed<boolean>(() => {
    if (this.hasLabel()) {
      return false;
    }
    return resolveConfigValue(
      coerceOptionalBooleanInput(this.decorativeInput()),
      this.config()?.decorative,
      false,
    );
  });

  /** ARIA role exposed on the rule. */
  readonly role = computed<'separator' | 'none'>(() =>
    this.decorative() ? 'none' : 'separator',
  );

  /** `aria-orientation` only carries meaning on a semantic separator. */
  readonly ariaOrientation = computed<SeparatorOrientation | null>(() =>
    this.decorative() ? null : this.orientation(),
  );
}
