import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { BadgeGroupProps } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { t } from '@synergos/vitals-core';
import {
  IconComponent,
  NOMBRES_DE_ICONO,
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-badge-group>: a group of badges / counters — small labelled pills, each optionally
 * carrying a numeric count, a tone (semantic color) and a target href. Used to surface tags,
 * statuses, facets or KPI counters in a compact, wrap-friendly cluster. Badges may be plain
 * (static) or selectable (toggle filters); selecting a badge emits a `badgeselect` CustomEvent
 * carrying the active badge ids.
 *
 * El `config` que manda el CMS tiene la forma de `BadgeGroupProps`, GENERADO del record C#
 * (ADR 0135): `badges` es una LISTA ya parseada (`label`/`tone`) y `layout`. La vista
 * mandaba el TEXTO `badgesJson` y este elemento hidrataba con «No hay elementos.» (D1).
 * `label`, `size`, `selectable`, `multiple`, `emptyLabel` y, por insignia, `id`, `count`,
 * `href` y `selected` no los autora el editor: llegan por atributo (`badges` como JSON), que
 * gana sobre el `config`.
 *
 * Su microcopia sale del diccionario, sección `BadgeGroup` (ADR 0136): el nombre del grupo sin rótulo
 * y el grupo vacío. El atributo `emptyLabel` sigue ganando.
 *
 * Cada insignia puede llevar un `icon`: un NOMBRE del set del design system (UI#89), que se
 * pinta con `syn-icon` delante del texto (CMS#192, caso 3). La descripción de `badgesJson`
 * prometía un `iconKey` que nadie pintaba; esa clave se sigue leyendo. Un nombre que el set no
 * tiene no se pinta —ni como palabra—.
 */

/**
 * Visual layout of the badge cluster. `grid` (CMS#192, caso 6): columnas iguales que se reparten
 * el ancho, para facetas o atributos que se leen en filas; antes caía a `wrap`.
 */
export type BadgeGroupLayout = 'wrap' | 'inline' | 'stack' | 'grid';

/** Density of each badge. */
export type BadgeGroupSize = 'sm' | 'md' | 'lg';

/** Semantic color of a badge. */
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/** A normalized, render-ready badge. */
export interface Badge {
  readonly id: string;
  readonly label: string;
  readonly count: number | null;
  readonly countLabel: string;
  readonly tone: BadgeTone;
  /** El nombre del icono del set, o `''` si la insignia no lleva (o pidió uno que no existe). */
  readonly icon: string;
  readonly href: string;
  readonly defaultSelected: boolean;
}

/** Emitted on the `badgeselect` CustomEvent and the typed Angular output. */
export interface BadgeSelectDetail {
  readonly id: string;
  readonly selectedIds: readonly string[];
}

const LAYOUTS: readonly BadgeGroupLayout[] = ['wrap', 'inline', 'stack', 'grid'];
const SIZES: readonly BadgeGroupSize[] = ['sm', 'md', 'lg'];
const TONES: readonly BadgeTone[] = ['neutral', 'brand', 'success', 'warning', 'danger', 'info'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return '';
}

function readCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

function normalizeLayout(value: unknown): BadgeGroupLayout {
  const candidate = readString(value).trim().toLowerCase() as BadgeGroupLayout;
  return LAYOUTS.includes(candidate) ? candidate : 'wrap';
}

function normalizeSize(value: unknown): BadgeGroupSize {
  const candidate = readString(value).trim().toLowerCase() as BadgeGroupSize;
  return SIZES.includes(candidate) ? candidate : 'md';
}

function normalizeTone(value: unknown): BadgeTone {
  const candidate = readString(value).trim().toLowerCase() as BadgeTone;
  return TONES.includes(candidate) ? candidate : 'neutral';
}

/** El icono por NOMBRE, cerrado al set del design system: lo que no está en él no se pinta. */
function normalizeIcon(value: unknown): string {
  return coerceStringEnumInput(readString(value).trim().toLowerCase(), NOMBRES_DE_ICONO) ?? '';
}

/** Compact, locale-aware count label (es-CO): 1.2k for large counts. */
function formatCount(count: number): string {
  if (Math.abs(count) >= 1000) {
    const compact = count / 1000;
    const rounded = Math.round(compact * 10) / 10;
    return `${new Intl.NumberFormat('es-CO').format(rounded)}k`;
  }
  return new Intl.NumberFormat('es-CO').format(count);
}

export function normalizeBadges(value: unknown): readonly Badge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: Badge[] = [];

  value.forEach((entry, index) => {
    let label = '';
    let badge: Record<string, unknown> = {};

    if (typeof entry === 'string') {
      label = entry.trim();
    } else if (isRecord(entry)) {
      badge = entry;
      label =
        readString(entry['label']).trim() ||
        readString(entry['text']).trim() ||
        readString(entry['name']).trim();
    }

    if (!label) {
      return;
    }

    const rawId = readString(badge['id']).trim();
    let id = rawId || `badge-${index}`;
    while (seen.has(id)) {
      id = `${id}-${index}`;
    }
    seen.add(id);

    const count = readCount(badge['count']);

    result.push({
      id,
      label,
      count,
      countLabel: count !== null ? formatCount(count) : '',
      tone: normalizeTone(badge['tone']),
      icon: normalizeIcon(badge['icon'] ?? badge['iconKey']),
      href: readString(badge['href']).trim() || readString(badge['url']).trim(),
      defaultSelected: readBoolean(badge['selected']),
    });
  });

  return result;
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeBadgeGroupConfig(value: Partial<BadgeGroupProps>): Partial<BadgeGroupProps> {
  const badges = normalizeBadges(value.badges);
  return omitUndefinedProperties<BadgeGroupProps>({
    badges: badges.length > 0 ? badges : undefined,
    layout: coerceStringEnumInput(value.layout, LAYOUTS),
  });
}

@Component({
  selector: 'sg-badge-group',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './badge-group.html',
  styleUrl: './badge-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-badge-group' },
})
export class BadgeGroupElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<BadgeGroupProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BadgeGroupProps>(sanitizeBadgeGroupConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly layoutInput = input<string | undefined>(undefined, { alias: 'layout' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly selectableInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'selectable',
    transform: coerceOptionalBooleanInput,
  });
  readonly multipleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'multiple',
    transform: coerceOptionalBooleanInput,
  });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly badgesInput = input<string | undefined>(undefined, { alias: 'badges' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `badgeselect` CustomEvent. */
  readonly badgeselect = output<BadgeSelectDetail>();

  readonly label = computed(() => this.labelInput() ?? '');
  readonly layout = computed<BadgeGroupLayout>(() =>
    normalizeLayout(resolveConfigValue(this.layoutInput(), this.config()?.layout, 'wrap')),
  );
  readonly size = computed<BadgeGroupSize>(() => normalizeSize(this.sizeInput() ?? 'md'));
  readonly selectable = computed(() => this.selectableInput() ?? false);
  readonly multiple = computed(() => this.multipleInput() ?? true);
  readonly emptyLabel = computed(() => this.emptyLabelInput() ?? t('BadgeGroup.Empty', 'No hay elementos.'));

  /** El nombre del grupo cuando no tiene rótulo visible (`BadgeGroup.Aria`). */
  readonly groupLabel = computed(() => t('BadgeGroup.Aria', 'Grupo de etiquetas'));

  readonly badges = computed<readonly Badge[]>(() =>
    normalizeBadges(this.resolveSource(this.badgesInput(), this.config()?.badges)),
  );

  readonly hasLabel = computed(() => this.label().trim().length > 0);
  readonly hasBadges = computed(() => this.badges().length > 0);

  /** Sum of every badge's count; useful as a group total / KPI roll-up. */
  readonly totalCount = computed(() =>
    this.badges().reduce((sum, badge) => sum + (badge.count ?? 0), 0),
  );

  /** User-driven selection overlay; `null` falls back to each badge default. */
  readonly #selectionOverride = signal<ReadonlySet<string> | null>(null);

  /** Currently selected badge ids (defaults seeded from config, then user). */
  readonly selectedIds = computed<ReadonlySet<string>>(() => {
    const override = this.#selectionOverride();
    if (override) {
      return override;
    }
    if (!this.selectable()) {
      return new Set<string>();
    }
    return new Set(this.badges().filter((badge) => badge.defaultSelected).map((badge) => badge.id));
  });

  isSelected(id: string): boolean {
    return this.selectable() && this.selectedIds().has(id);
  }

  /** Toggle a selectable badge; honors single vs multiple selection. */
  toggle(badge: Badge): void {
    if (!this.selectable()) {
      return;
    }

    const current = new Set(this.selectedIds());
    if (current.has(badge.id)) {
      current.delete(badge.id);
    } else {
      if (!this.multiple()) {
        current.clear();
      }
      current.add(badge.id);
    }

    this.#selectionOverride.set(current);
    this.badgeselect.emit({ id: badge.id, selectedIds: [...current] });
  }

  onKeydown(event: KeyboardEvent, badge: Badge): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.toggle(badge);
    }
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
