import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynColorSwatches</c>.
 *
 * A selectable palette of color swatches — a visitor (or editor preview)
 * picks one chip and the component emits a `swatchselect` CustomEvent with
 * the chosen value. Used by product variant pickers, theme selectors and the
 * design-system palette previews. Swatches are supplied inline via
 * `swatches` (JSON array) or through the `config` object.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface ColorSwatchesRuntimeConfig {
  readonly heading?: string;
  readonly shape?: string;
  readonly columns?: number;
  readonly selected?: string;
  readonly allowDeselect?: boolean;
  readonly swatches?: readonly ColorSwatchConfig[];
}

export interface ColorSwatchConfig {
  readonly value?: string;
  readonly label?: string;
  readonly color?: string;
  readonly disabled?: boolean;
}

export interface ColorSwatch {
  readonly value: string;
  readonly label: string;
  readonly color: string;
  readonly disabled: boolean;
}

/** Emitted on the `swatchselect` CustomEvent and the typed Angular output. */
export interface ColorSwatchSelectDetail {
  readonly value: string;
  readonly label: string;
  readonly color: string;
}

export type ColorSwatchShape = 'square' | 'circle' | 'pill';

const SWATCH_SHAPES: readonly ColorSwatchShape[] = ['square', 'circle', 'pill'];
const DEFAULT_SHAPE: ColorSwatchShape = 'circle';
const DEFAULT_COLUMNS = 6;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 12;

/** Hex (#rgb/#rrggbb/#rrggbbaa), rgb/rgba/hsl/hsla, or a CSS named/var color. */
const COLOR_PATTERN =
  /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla)\([^)]+\)|var\(--[\w-]+\)|[a-z]+)$/i;

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
  return '';
}

/** Keep only color expressions we can safely drop into a `background`. */
export function normalizeColor(value: unknown): string {
  const raw = readString(value).trim();
  if (!raw || !COLOR_PATTERN.test(raw)) {
    return '';
  }
  return raw;
}

export function normalizeShape(value: unknown): ColorSwatchShape {
  return coerceStringEnumInput(value, SWATCH_SHAPES) ?? DEFAULT_SHAPE;
}

export function clampColumns(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_COLUMNS;
  }
  const rounded = Math.round(value);
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, rounded));
}

export function normalizeSwatches(value: unknown): readonly ColorSwatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: ColorSwatch[] = [];

  for (const entry of value) {
    let color = '';
    let valueId = '';
    let label = '';
    let disabled = false;

    if (typeof entry === 'string') {
      color = normalizeColor(entry);
      valueId = entry.trim();
      label = entry.trim();
    } else if (isRecord(entry)) {
      color = normalizeColor(entry['color'] ?? entry['value']);
      valueId = readString(entry['value']).trim() || color;
      label = readString(entry['label']).trim() || valueId;
      disabled = coerceOptionalBooleanInput(entry['disabled']) ?? false;
    }

    if (!color || !valueId) {
      continue;
    }
    if (seen.has(valueId)) {
      continue;
    }
    seen.add(valueId);
    result.push({ value: valueId, label: label || valueId, color, disabled });
  }

  return result;
}

function sanitizeColorSwatchesConfig(
  value: Partial<ColorSwatchesRuntimeConfig>,
): ColorSwatchesRuntimeConfig {
  return omitUndefinedProperties<ColorSwatchesRuntimeConfig>({
    heading: coerceTrimmedStringInput(value.heading),
    shape: coerceTrimmedStringInput(value.shape),
    columns: coerceOptionalNumberInput(value.columns),
    selected: coerceTrimmedStringInput(value.selected),
    allowDeselect: coerceOptionalBooleanInput(value.allowDeselect),
    swatches: value.swatches,
  });
}

@Component({
  selector: 'sg-color-swatches',
  standalone: true,
  templateUrl: './color-swatches.html',
  styleUrl: './color-swatches.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-color-swatches' },
})
export class ColorSwatchesElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<ColorSwatchesRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ColorSwatchesRuntimeConfig>(sanitizeColorSwatchesConfig),
  });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly shapeInput = input<string | undefined>(undefined, { alias: 'shape' });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly selectedInput = input<string | undefined>(undefined, { alias: 'selected' });
  readonly allowDeselectInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'allowDeselect',
    transform: coerceOptionalBooleanInput,
  });
  readonly swatchesInput = input<string | undefined>(undefined, { alias: 'swatches' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `swatchselect` CustomEvent. */
  readonly swatchselect = output<ColorSwatchSelectDetail>();

  readonly heading = computed(() =>
    resolveConfigValue(this.headingInput(), this.config()?.heading, ''),
  );
  readonly hasHeading = computed(() => this.heading().trim().length > 0);

  readonly shape = computed<ColorSwatchShape>(() =>
    normalizeShape(resolveConfigValue(this.shapeInput(), this.config()?.shape, DEFAULT_SHAPE)),
  );

  readonly columns = computed(() =>
    clampColumns(resolveConfigValue(this.columnsInput(), this.config()?.columns, DEFAULT_COLUMNS)),
  );

  readonly allowDeselect = computed(() =>
    resolveConfigValue(this.allowDeselectInput(), this.config()?.allowDeselect, false),
  );

  readonly swatches = computed<readonly ColorSwatch[]>(() =>
    normalizeSwatches(this.resolveSource(this.swatchesInput(), this.config()?.swatches)),
  );

  readonly hasSwatches = computed(() => this.swatches().length > 0);

  /** Currently selected swatch value (null until the visitor picks one). */
  readonly selectedValue = signal<string | null>(null);

  /** Swatch value that holds keyboard focus inside the group (roving). */
  readonly #focusedValue = signal<string | null>(null);

  /** Value that should carry tabindex=0 (roving): focused → selected → first. */
  readonly focusedValue = computed<string>(() => {
    const swatches = this.swatches();
    const enabled = swatches.filter((swatch) => !swatch.disabled);
    const pool = enabled.length > 0 ? enabled : swatches;

    const focused = this.#focusedValue();
    if (focused && pool.some((swatch) => swatch.value === focused)) {
      return focused;
    }

    const selected = this.selectedValue();
    if (selected && pool.some((swatch) => swatch.value === selected)) {
      return selected;
    }

    return pool[0]?.value ?? '';
  });

  readonly selectedSwatch = computed<ColorSwatch | null>(() => {
    const selected = this.selectedValue();
    if (!selected) {
      return null;
    }
    return this.swatches().find((swatch) => swatch.value === selected) ?? null;
  });

  constructor() {
    // Adopt the configured initial selection whenever it changes (and is valid).
    effect(() => {
      const requested = resolveConfigValue(this.selectedInput(), this.config()?.selected, '');
      const swatches = this.swatches();
      if (requested && swatches.some((swatch) => swatch.value === requested && !swatch.disabled)) {
        this.selectedValue.set(requested);
        this.#focusedValue.set(requested);
      }
    });
  }

  isSelected(swatch: ColorSwatch): boolean {
    return this.selectedValue() === swatch.value;
  }

  selectSwatch(swatch: ColorSwatch): void {
    if (swatch.disabled) {
      return;
    }

    if (this.selectedValue() === swatch.value && this.allowDeselect()) {
      this.selectedValue.set(null);
    } else {
      this.selectedValue.set(swatch.value);
    }

    this.#focusedValue.set(swatch.value);

    const detail: ColorSwatchSelectDetail = {
      value: swatch.value,
      label: swatch.label,
      color: swatch.color,
    };
    this.swatchselect.emit(detail);
  }

  /** Roving keyboard navigation across the swatch group. */
  onSwatchKeydown(event: KeyboardEvent, swatch: ColorSwatch): void {
    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(swatch.value, 1),
      ArrowDown: () => this.moveFocus(swatch.value, 1),
      ArrowLeft: () => this.moveFocus(swatch.value, -1),
      ArrowUp: () => this.moveFocus(swatch.value, -1),
      Home: () => this.moveFocusToEdge('start'),
      End: () => this.moveFocusToEdge('end'),
      Enter: () => this.selectSwatch(swatch),
      ' ': () => this.selectSwatch(swatch),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private enabledSwatches(): readonly ColorSwatch[] {
    return this.swatches().filter((swatch) => !swatch.disabled);
  }

  private moveFocus(fromValue: string, delta: number): void {
    const enabled = this.enabledSwatches();
    if (enabled.length === 0) {
      return;
    }

    const currentIndex = enabled.findIndex((swatch) => swatch.value === fromValue);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + delta + enabled.length) % enabled.length;
    const target = enabled[nextIndex];

    this.#focusedValue.set(target.value);
    this.focusChip(target.value);
  }

  private moveFocusToEdge(edge: 'start' | 'end'): void {
    const enabled = this.enabledSwatches();
    if (enabled.length === 0) {
      return;
    }
    const target = edge === 'start' ? enabled[0] : enabled[enabled.length - 1];
    this.#focusedValue.set(target.value);
    this.focusChip(target.value);
  }

  private focusChip(value: string): void {
    // Defer to next frame so the re-rendered group contains the target chip.
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-color-swatches, synergos-color-swatches');
      const root = host?.shadowRoot ?? document;
      const chip = (root as ParentNode).querySelector<HTMLElement>(
        `[data-swatch-value="${CSS?.escape ? CSS.escape(value) : value}"]`,
      );
      chip?.focus();
    });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
