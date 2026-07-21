import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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
 */
export type SeparatorOrientation = 'horizontal' | 'vertical';
export type SeparatorLabelAlign = 'start' | 'center' | 'end';

export interface SeparatorRuntimeConfig {
  readonly orientation?: SeparatorOrientation;
  readonly label?: string;
  readonly labelAlign?: SeparatorLabelAlign;
  readonly decorative?: boolean;
}

const ORIENTATIONS: readonly SeparatorOrientation[] = ['horizontal', 'vertical'];
const LABEL_ALIGNS: readonly SeparatorLabelAlign[] = ['start', 'center', 'end'];

const DEFAULT_ORIENTATION: SeparatorOrientation = 'horizontal';
const DEFAULT_LABEL_ALIGN: SeparatorLabelAlign = 'center';

function sanitizeSeparatorConfig(value: Partial<SeparatorRuntimeConfig>): SeparatorRuntimeConfig {
  return omitUndefinedProperties<SeparatorRuntimeConfig>({
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
    '[attr.data-has-label]': 'hasLabel() ? "" : null',
  },
})
export class SeparatorElementComponent {
  readonly config = input<SeparatorRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SeparatorRuntimeConfig>(sanitizeSeparatorConfig),
  });
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
