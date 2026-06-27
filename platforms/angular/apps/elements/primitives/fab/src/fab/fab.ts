import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynFab</c>.
 *
 * A floating action button: a fixed, circular trigger anchored to a screen
 * corner that carries a single icon and an optional tooltip label. When an
 * `actionLink` is supplied it renders as an anchor; otherwise it renders as a
 * button and emits a `fabactivate` CustomEvent so the host page can react.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface FabRuntimeConfig {
  readonly iconKey?: string;
  readonly actionLink?: string;
  readonly position?: string;
  readonly label?: string;
  readonly tooltip?: string;
  readonly target?: string;
}

/** Emitted on the `fabactivate` CustomEvent and the typed Angular output. */
export interface FabActivateDetail {
  readonly actionLink: string;
}

type FabCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

const DEFAULT_POSITION: FabCorner = 'bottom-right';
const VALID_POSITIONS: readonly FabCorner[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

const DEFAULT_ICON = 'plus';

/** Inline SVG path data, keyed by icon name. Keeps the primitive self-contained. */
const ICON_PATHS: Readonly<Record<string, string>> = {
  plus: 'M12 5v14M5 12h14',
  message: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 1 1 17-4Z',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
  chat: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 1 1 17-4Z',
  arrow_up: 'M12 19V5M5 12l7-7 7 7',
  cart: 'M6 6h15l-1.5 9h-12L5 3H2M6 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm12 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  whatsapp:
    'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 1 1 17-4Z',
};

function isExternalTarget(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
}

function sanitizeFabConfig(value: Partial<FabRuntimeConfig>): FabRuntimeConfig {
  return omitUndefinedProperties<FabRuntimeConfig>({
    iconKey: coerceTrimmedStringInput(value.iconKey),
    actionLink: coerceTrimmedStringInput(value.actionLink),
    position: coerceTrimmedStringInput(value.position),
    label: coerceTrimmedStringInput(value.label),
    tooltip: coerceTrimmedStringInput(value.tooltip),
    target: coerceTrimmedStringInput(value.target),
  });
}

@Component({
  selector: 'sg-fab',
  standalone: true,
  templateUrl: './fab.html',
  styleUrl: './fab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-fab',
    '[attr.data-position]': 'position()',
  },
})
export class FabElementComponent {
  readonly config = input<FabRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FabRuntimeConfig>(sanitizeFabConfig),
  });
  readonly iconKeyInput = input<string | undefined>(undefined, { alias: 'iconKey' });
  readonly actionLinkInput = input<string | undefined>(undefined, { alias: 'actionLink' });
  readonly positionInput = input<string | undefined>(undefined, { alias: 'position' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly tooltipInput = input<string | undefined>(undefined, { alias: 'tooltip' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `fabactivate` CustomEvent. */
  readonly fabactivate = output<FabActivateDetail>();

  /** Whether the optional tooltip is currently shown (hover/focus). */
  readonly #tooltipOpen = signal(false);
  readonly tooltipOpen = this.#tooltipOpen.asReadonly();

  readonly iconKey = computed(() =>
    resolveConfigValue(this.iconKeyInput(), this.config()?.iconKey, DEFAULT_ICON),
  );

  /** Resolved SVG path, falling back to the default glyph for unknown keys. */
  readonly iconPath = computed(() => ICON_PATHS[this.iconKey()] ?? ICON_PATHS[DEFAULT_ICON]);

  readonly actionLink = computed(() =>
    resolveConfigValue(this.actionLinkInput(), this.config()?.actionLink, ''),
  );

  readonly position = computed<FabCorner>(() => {
    const resolved = resolveConfigValue(
      this.positionInput(),
      this.config()?.position,
      DEFAULT_POSITION,
    );
    return VALID_POSITIONS.includes(resolved as FabCorner)
      ? (resolved as FabCorner)
      : DEFAULT_POSITION;
  });

  /** Visible tooltip text (optional). */
  readonly tooltip = computed(() =>
    resolveConfigValue(this.tooltipInput(), this.config()?.tooltip, ''),
  );

  /** Accessible name for the trigger; falls back to the tooltip text. */
  readonly label = computed(() => {
    const explicit = resolveConfigValue(this.labelInput(), this.config()?.label, '');
    return explicit || this.tooltip() || 'Acción';
  });

  readonly hasTooltip = computed(() => this.tooltip().length > 0);

  /** Renders as an anchor when a link is configured, otherwise a button. */
  readonly isLink = computed(() => this.actionLink().length > 0);

  readonly target = computed(() => {
    const explicit = resolveConfigValue(this.targetInput(), this.config()?.target, '');
    if (explicit) {
      return explicit;
    }
    return isExternalTarget(this.actionLink()) ? '_blank' : '';
  });

  readonly rel = computed(() => (this.target() === '_blank' ? 'noopener noreferrer' : null));

  openTooltip(): void {
    if (this.hasTooltip()) {
      this.#tooltipOpen.set(true);
    }
  }

  closeTooltip(): void {
    this.#tooltipOpen.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.#tooltipOpen()) {
      event.preventDefault();
      this.closeTooltip();
    }
  }

  /** Fired when the button variant is activated (no link configured). */
  activate(): void {
    if (this.isLink()) {
      return;
    }
    this.fabactivate.emit({ actionLink: this.actionLink() });
  }
}
