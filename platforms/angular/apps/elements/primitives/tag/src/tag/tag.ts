import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynTag</c>.
 *
 * A chip / etiqueta primitive: a compact, pill-shaped label with a color
 * variant, an optional leading icon glyph, and an optional remove affordance.
 * Tones map to the design-system semantic palette (brand / success / warning /
 * danger / info / neutral) and resolve to CMS `--syn-*` runtime variables so a
 * site theme can override them without a rebuild.
 *
 * The shared `@synergos/contracts` package does not declare a `TagElementConfig`
 * yet; the canonical shape lives here next to the component until that contract
 * lands in the registry ola.
 */
export interface TagRuntimeConfig {
  readonly label?: string;
  readonly color?: TagColor;
  readonly icon?: string;
  readonly removable?: boolean;
  readonly ariaLabel?: string;
  readonly removeLabel?: string;
}

export type TagColor = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TAG_COLORS: readonly TagColor[] = [
  'neutral',
  'brand',
  'success',
  'warning',
  'danger',
  'info',
];

function sanitizeTagConfig(value: Partial<TagRuntimeConfig>): Partial<TagRuntimeConfig> {
  return omitUndefinedProperties<TagRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    color: coerceStringEnumInput(value.color, TAG_COLORS),
    icon: coerceTrimmedStringInput(value.icon),
    removable: coerceOptionalBooleanInput(value.removable),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    removeLabel: coerceTrimmedStringInput(value.removeLabel),
  });
}

@Component({
  selector: 'sg-tag',
  standalone: true,
  templateUrl: './tag.html',
  styleUrl: './tag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tag' },
})
export class TagElementComponent {
  readonly config = input<TagRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TagRuntimeConfig>(sanitizeTagConfig),
  });

  // CMS-aliased property bridges. The legacy `tagLabel` / `tagColor` aliases are
  // preserved so existing content keeps rendering; `label` / `color` are the
  // canonical aliases going forward.
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly tagLabelInput = input<string | undefined>(undefined, { alias: 'tagLabel' });
  readonly colorInput = input<TagColor | undefined, unknown>(undefined, {
    alias: 'color',
    transform: (value: unknown) => coerceStringEnumInput(value, TAG_COLORS),
  });
  readonly tagColorInput = input<TagColor | undefined, unknown>(undefined, {
    alias: 'tagColor',
    transform: (value: unknown) => coerceStringEnumInput(value, TAG_COLORS),
  });
  readonly iconInput = input<string | undefined>(undefined, { alias: 'icon' });
  readonly removableInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'removable',
    transform: coerceOptionalBooleanInput,
  });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly removeLabelInput = input<string | undefined>(undefined, { alias: 'removeLabel' });

  /** Emitted when the user activates the remove affordance. Payload = the label. */
  readonly removed = output<string>();

  /** Local dismissal state — a removed chip collapses out of the layout. */
  private readonly dismissed = signal(false);

  readonly label = computed(() =>
    resolveConfigValue(
      this.labelInput() ?? this.tagLabelInput(),
      this.config()?.label,
      '',
    ),
  );

  readonly color = computed<TagColor>(() =>
    resolveConfigValue(
      this.colorInput() ?? this.tagColorInput(),
      this.config()?.color,
      'neutral',
    ),
  );

  readonly icon = computed(() =>
    resolveConfigValue(this.iconInput(), this.config()?.icon, ''),
  );

  readonly removable = computed(() =>
    resolveConfigValue(this.removableInput(), this.config()?.removable, false),
  );

  readonly removeLabel = computed(() =>
    resolveConfigValue(this.removeLabelInput(), this.config()?.removeLabel, 'Quitar'),
  );

  /** Accessible name for the chip; falls back to the visible label. */
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, '') || this.label(),
  );

  readonly hasIcon = computed(() => this.icon().length > 0);
  readonly hasLabel = computed(() => this.label().length > 0);

  /** A chip with no label and no icon has nothing to render. */
  readonly isRenderable = computed(() => this.hasLabel() || this.hasIcon());

  /** Visible only while it has content and has not been dismissed. */
  readonly isVisible = computed(() => this.isRenderable() && !this.dismissed());

  /** Composed remove-button accessible name, e.g. "Quitar Frontend". */
  readonly removeButtonLabel = computed(() => {
    const action = this.removeLabel();
    const subject = this.label();
    return subject ? `${action} ${subject}` : action;
  });

  remove(): void {
    if (!this.removable() || this.dismissed()) {
      return;
    }

    this.dismissed.set(true);
    this.removed.emit(this.label());
  }

  /** Test/host hook to restore a dismissed chip (idempotent re-render). */
  reset(): void {
    this.dismissed.set(false);
  }
}
