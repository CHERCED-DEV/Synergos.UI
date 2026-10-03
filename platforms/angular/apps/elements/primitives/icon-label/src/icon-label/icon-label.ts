import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { IconLabelProps } from '@synergos/contracts';
import {
  IconComponent,
  NOMBRES_DE_ICONO,
  type IconSize,
  type IconTone,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-icon-label>: an inline icon + text label primitive: a glyph token (font/emoji symbol or
 * named icon) followed by a short text label, rendered on a single baseline.
 * Three render modes are supported, resolved from the configured props:
 *   - `static`  → a plain <span> (default, decorative pairing).
 *   - `link`    → an <a> when an `href` is supplied.
 *   - `action`  → a <button> when `interactive` is set (emits `iconlabelactivate`).
 *
 * El `config` que manda el CMS tiene la forma de `IconLabelProps`, GENERADO del record C#
 * (ADR 0135): `iconName` y `labelText`. La vista mandaba `iconKey` y este elemento pintaba el
 * texto sin el icono (D1). `iconSymbol`, `href`, `target`, `ariaLabel`, `size`, `tone`,
 * `gap`, `iconTrailing` e `interactive` no los autora el editor: llegan por atributo.
 */
export type IconLabelSize = IconSize;
export type IconLabelTone = IconTone;
export type IconLabelGap = 'sm' | 'md' | 'lg';

/** Emitted on the `iconlabelactivate` CustomEvent and the typed Angular output. */
export interface IconLabelActivateDetail {
  readonly label: string;
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeIconLabelConfig(value: Partial<IconLabelProps>): Partial<IconLabelProps> {
  return omitUndefinedProperties<IconLabelProps>({
    // El vocabulario es el set del design system (UI#89): un nombre que el set no tiene no viaja,
    // en vez de pintarse como palabra. El CMS ofrece la MISMA lista en su desplegable.
    iconName: coerceStringEnumInput(value.iconName, NOMBRES_DE_ICONO),
    labelText: coerceTrimmedStringInput(value.labelText),
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
  readonly config = input<Partial<IconLabelProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<IconLabelProps>(sanitizeIconLabelConfig),
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

  readonly iconSymbol = computed(() => this.iconSymbolInput() ?? '');
  readonly iconName = computed(() =>
    resolveConfigValue(this.iconNameInput(), this.config()?.iconName, ''),
  );
  readonly labelText = computed(() =>
    resolveConfigValue(this.labelTextInput(), this.config()?.labelText, ''),
  );
  readonly href = computed(() => this.hrefInput() ?? '');
  readonly target = computed(() => this.targetInput() ?? '');
  readonly ariaLabel = computed(() => this.ariaLabelInput() ?? '');
  readonly size = computed<IconLabelSize>(() => this.sizeInput() ?? 'md');
  readonly tone = computed<IconLabelTone>(() => this.toneInput() ?? 'neutral');
  readonly gap = computed<IconLabelGap>(() => this.gapInput() ?? 'sm');
  readonly iconTrailing = computed(() => this.iconTrailingInput() ?? false);
  readonly interactive = computed(() => this.interactiveInput() ?? false);

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
