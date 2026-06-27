import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  IconComponent,
  type IconSize,
  type IconTone,
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynIconLabel</c>.
 *
 * An inline icon + text label primitive: a glyph token (font/emoji symbol or
 * named icon) followed by a short text label, rendered on a single baseline.
 * Three render modes are supported, resolved from the configured props:
 *   - `static`  → a plain <span> (default, decorative pairing).
 *   - `link`    → an <a> when an `href` is supplied.
 *   - `action`  → a <button> when `interactive` is set (emits `iconlabelactivate`).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type IconLabelSize = IconSize;
export type IconLabelTone = IconTone;
export type IconLabelGap = 'sm' | 'md' | 'lg';

export interface IconLabelRuntimeConfig {
  readonly iconSymbol?: string;
  readonly iconName?: string;
  readonly labelText?: string;
  readonly href?: string;
  readonly target?: string;
  readonly ariaLabel?: string;
  readonly size?: IconLabelSize;
  readonly tone?: IconLabelTone;
  readonly gap?: IconLabelGap;
  readonly iconTrailing?: boolean;
  readonly interactive?: boolean;
}

/** Emitted on the `iconlabelactivate` CustomEvent and the typed Angular output. */
export interface IconLabelActivateDetail {
  readonly label: string;
}

const SIZES = ['sm', 'md', 'lg'] as const;
const TONES = ['neutral', 'brand', 'inverse'] as const;
const GAPS = ['sm', 'md', 'lg'] as const;

function sanitizeIconLabelConfig(
  value: Partial<IconLabelRuntimeConfig>,
): Partial<IconLabelRuntimeConfig> {
  return omitUndefinedProperties<IconLabelRuntimeConfig>({
    iconSymbol: coerceTrimmedStringInput(value.iconSymbol),
    iconName: coerceTrimmedStringInput(value.iconName),
    labelText: coerceTrimmedStringInput(value.labelText),
    href: coerceTrimmedStringInput(value.href),
    target: coerceTrimmedStringInput(value.target),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    size: coerceStringEnumInput(value.size, SIZES),
    tone: coerceStringEnumInput(value.tone, TONES),
    gap: coerceStringEnumInput(value.gap, GAPS),
    iconTrailing: coerceOptionalBooleanInput(value.iconTrailing),
    interactive: coerceOptionalBooleanInput(value.interactive),
  });
}

@Component({
  selector: 'sg-icon-label',
  standalone: true,
  imports: [IconComponent, NgTemplateOutlet],
  templateUrl: './icon-label.html',
  styleUrl: './icon-label.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-icon-label' },
})
export class IconLabelElementComponent {
  readonly config = input<Partial<IconLabelRuntimeConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<IconLabelRuntimeConfig>(sanitizeIconLabelConfig),
  });

  readonly iconSymbolInput = input<string | undefined>(undefined, { alias: 'iconSymbol' });
  readonly iconNameInput = input<string | undefined>(undefined, { alias: 'iconName' });
  readonly labelTextInput = input<string | undefined>(undefined, { alias: 'labelText' });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly sizeInput = input<IconLabelSize | undefined>(undefined, { alias: 'size' });
  readonly toneInput = input<IconLabelTone | undefined>(undefined, { alias: 'tone' });
  readonly gapInput = input<IconLabelGap | undefined>(undefined, { alias: 'gap' });
  readonly iconTrailingInput = input<boolean | undefined>(undefined, { alias: 'iconTrailing' });
  readonly interactiveInput = input<boolean | undefined>(undefined, { alias: 'interactive' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `iconlabelactivate` CustomEvent. */
  readonly iconlabelactivate = output<IconLabelActivateDetail>();

  readonly iconSymbol = computed(() =>
    resolveConfigValue(this.iconSymbolInput(), this.config()?.iconSymbol, ''),
  );
  readonly iconName = computed(() =>
    resolveConfigValue(this.iconNameInput(), this.config()?.iconName, ''),
  );
  readonly labelText = computed(() =>
    resolveConfigValue(this.labelTextInput(), this.config()?.labelText, ''),
  );
  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.config()?.href, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.config()?.target, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly size = computed<IconLabelSize>(() =>
    resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'),
  );
  readonly tone = computed<IconLabelTone>(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'neutral'),
  );
  readonly gap = computed<IconLabelGap>(() =>
    resolveConfigValue(this.gapInput(), this.config()?.gap, 'sm'),
  );
  readonly iconTrailing = computed(() =>
    resolveConfigValue(this.iconTrailingInput(), this.config()?.iconTrailing, false),
  );
  readonly interactive = computed(() =>
    resolveConfigValue(this.interactiveInput(), this.config()?.interactive, false),
  );

  /** True when there is a glyph (named icon or raw symbol) to show. */
  readonly hasIcon = computed(() => this.iconSymbol().length > 0 || this.iconName().length > 0);

  /** True when there is any text label to show. */
  readonly hasLabel = computed(() => this.labelText().length > 0);

  /** Whether the primitive renders anything at all. */
  readonly isEmpty = computed(() => !this.hasIcon() && !this.hasLabel());

  /** Resolved render mode, derived from href / interactive. */
  readonly mode = computed<'static' | 'link' | 'action'>(() => {
    if (this.href().length > 0) {
      return 'link';
    }
    if (this.interactive()) {
      return 'action';
    }
    return 'static';
  });

  /** Accessible name: explicit ariaLabel, else the visible label. */
  readonly accessibleLabel = computed(() => this.ariaLabel() || this.labelText());

  /** `rel` hardening for links that open in a new tab. */
  readonly linkRel = computed(() =>
    this.target() === '_blank' ? 'noopener noreferrer' : null,
  );

  /** Class list driving layout (order + gap) on the wrapper. */
  readonly rootClass = computed(() => {
    const classes = ['icon-label', `icon-label--gap-${this.gap()}`, `icon-label--${this.tone()}`];
    if (this.iconTrailing()) {
      classes.push('icon-label--trailing');
    }
    if (this.mode() !== 'static') {
      classes.push('icon-label--interactive');
    }
    return classes.join(' ');
  });

  activate(): void {
    if (this.mode() !== 'action') {
      return;
    }
    this.iconlabelactivate.emit({ label: this.labelText() });
  }
}
