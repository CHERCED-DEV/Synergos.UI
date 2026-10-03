import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { FabProps } from '@synergos/contracts';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  NOMBRES_DE_ICONO,
  trazosDeIcono,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { t } from '@synergos/vitals-core';

/**
 * <synergos-fab>: a floating action button — a fixed, circular trigger anchored to a screen
 * corner that carries a single icon and an optional tooltip label. When an `actionLink` is
 * supplied it renders as an anchor; otherwise it renders as a button and emits a `fabactivate`
 * CustomEvent so the host page can react.
 *
 * El `config` que manda el CMS tiene la forma de `FabProps`, GENERADO del record C# (ADR 0135):
 * `actionLink` y `target` salen del enlace del editor y `label` es su nombre accesible. La vista
 * mandaba `actionUrl`/`ariaLabel`: el botón no llevaba a ningún sitio y se anunciaba como
 * «Acción» (D1). `tooltip` no lo autora el editor: llega por atributo.
 *
 * El último respaldo del nombre accesible —sin rótulo del editor ni tooltip— sale del
 * diccionario con `t()` (ADR 0136), sección `Fab` que declara `FabProps`. El `rel` de un enlace
 * externo (`noopener noreferrer`) no es texto de interfaz: es un valor técnico y no se traduce.
 */
/** Emitted on the `fabactivate` CustomEvent and the typed Angular output. */
export interface FabActivateDetail {
  readonly actionLink: string;
}

type FabCorner =
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'top-right'
  | 'top-left'
  | 'top-center';

const DEFAULT_POSITION: FabCorner = 'bottom-right';
const VALID_POSITIONS: readonly FabCorner[] = [
  'bottom-right',
  'bottom-left',
  'bottom-center',
  'top-right',
  'top-left',
  'top-center',
];

const DEFAULT_ICON = 'plus';


function isExternalTarget(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeFabConfig(value: Partial<FabProps>): Partial<FabProps> {
  return omitUndefinedProperties<FabProps>({
    // El icono es del set del design system (CMS#192, caso 25): el editor elige de DT.Select.Icono.
    iconKey: coerceStringEnumInput(value.iconKey, NOMBRES_DE_ICONO),
    actionLink: coerceTrimmedStringInput(value.actionLink),
    target: coerceTrimmedStringInput(value.target),
    position: coerceStringEnumInput(value.position, VALID_POSITIONS),
    label: coerceTrimmedStringInput(value.label),
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
  readonly config = input<Partial<FabProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FabProps>(sanitizeFabConfig),
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
    resolveConfigValue(
      coerceStringEnumInput(this.iconKeyInput(), NOMBRES_DE_ICONO),
      this.config()?.iconKey,
      DEFAULT_ICON,
    ),
  );

  /**
   * Los trazos del icono, del set del design system (UI#89): una sola fuente para todos los
   * elementos. Antes `fab` tenía su mapa privado de nueve iconos.
   */
  readonly iconPaths = computed(() => trazosDeIcono(this.iconKey()) ?? trazosDeIcono(DEFAULT_ICON) ?? []);

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
  readonly tooltip = computed(() => this.tooltipInput() ?? '');

  /** Accessible name for the trigger; falls back to the tooltip text. */
  readonly label = computed(() => {
    const explicit = resolveConfigValue(this.labelInput(), this.config()?.label, '');
    return explicit || this.tooltip() || t('Fab.Aria', 'Acción');
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
