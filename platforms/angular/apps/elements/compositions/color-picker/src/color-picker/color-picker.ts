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
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynColorPicker</c>.
 *
 * A compact color selector: a preview swatch, an editable hex field, and a
 * grid of preset swatches (the palette). Picking a swatch or committing a
 * valid hex emits a `colorchange` CustomEvent carrying the normalized
 * `#rrggbb` value. Built for theming/branding surfaces where a visitor (or
 * editor) chooses an accent color from a curated palette.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface ColorPickerRuntimeConfig {
  readonly label?: string;
  readonly initialColor?: string;
  readonly palette?: readonly string[];
}

/** Emitted on the `colorchange` CustomEvent and the typed Angular output. */
export interface ColorPickerChangeDetail {
  readonly color: string;
}

interface PaletteSwatch {
  readonly hex: string;
  readonly label: string;
}

const SHORT_HEX = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#?([0-9a-f]{6})$/i;

const DEFAULT_LABEL = 'Color';
const DEFAULT_COLOR = '#4f6ef7';
const DEFAULT_PALETTE: readonly string[] = [
  '#4f6ef7',
  '#3854d8',
  '#8b5cf6',
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#0f172a',
];

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

/**
 * Coerce arbitrary input to a canonical lowercase `#rrggbb` string, expanding
 * the `#rgb` shorthand. Returns '' when the value is not a valid hex color.
 */
export function normalizeHex(value: unknown): string {
  const raw = readString(value).trim();
  if (!raw) {
    return '';
  }

  const long = LONG_HEX.exec(raw);
  if (long) {
    return `#${long[1].toLowerCase()}`;
  }

  const short = SHORT_HEX.exec(raw);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }

  return '';
}

/** Parse a palette source (array / JSON string) into deduped valid swatches. */
export function normalizePalette(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const hex = normalizeHex(isRecord(entry) ? entry['hex'] ?? entry['value'] : entry);
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      result.push(hex);
    }
  }
  return result;
}

/**
 * Relative luminance (WCAG) of a `#rrggbb` color, used to pick a legible
 * checkmark color against the selected swatch.
 */
export function isLightColor(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return true;
  }
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const toLinear = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.5;
}

function sanitizeColorPickerConfig(
  value: Partial<ColorPickerRuntimeConfig>,
): ColorPickerRuntimeConfig {
  return omitUndefinedProperties<ColorPickerRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    initialColor: coerceTrimmedStringInput(value.initialColor),
    palette: value.palette,
  });
}

@Component({
  selector: 'sg-color-picker',
  standalone: true,
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-color-picker' },
})
export class ColorPickerElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<ColorPickerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ColorPickerRuntimeConfig>(sanitizeColorPickerConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly initialColorInput = input<string | undefined>(undefined, { alias: 'initialColor' });
  readonly paletteInput = input<string | undefined>(undefined, { alias: 'paletteJson' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `colorchange` CustomEvent. */
  readonly colorchange = output<ColorPickerChangeDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, DEFAULT_LABEL),
  );

  readonly initialColor = computed(() => {
    const resolved = resolveConfigValue(this.initialColorInput(), this.config()?.initialColor, '');
    return normalizeHex(resolved) || DEFAULT_COLOR;
  });

  /** Preset swatches; falls back to the canonical brand palette. */
  readonly palette = computed<readonly PaletteSwatch[]>(() => {
    const source = normalizePalette(this.resolveSource(this.paletteInput(), this.config()?.palette));
    const hexes = source.length > 0 ? source : DEFAULT_PALETTE;
    return hexes.map((hex) => ({ hex, label: hex.toUpperCase() }));
  });

  /** Committed color (the source of truth surfaced to consumers). */
  readonly #selected = signal<string>(DEFAULT_COLOR);
  readonly selected = this.#selected.asReadonly();

  /** Live text in the hex field — may be mid-edit and invalid. */
  readonly draft = signal<string>(DEFAULT_COLOR);

  /** Swatch carrying roving focus inside the palette grid. */
  readonly #focusedHex = signal<string | null>(null);

  readonly isDraftValid = computed(() => normalizeHex(this.draft()) !== '');
  readonly selectedLabel = computed(() => this.selected().toUpperCase());
  readonly selectedIsLight = computed(() => isLightColor(this.selected()));

  /** Hex that should carry tabindex=0 in the palette (roving). */
  readonly focusedHex = computed<string>(() => {
    const swatches = this.palette();
    if (swatches.length === 0) {
      return '';
    }

    const focused = this.#focusedHex();
    if (focused && swatches.some((swatch) => swatch.hex === focused)) {
      return focused;
    }

    const selected = this.selected();
    if (swatches.some((swatch) => swatch.hex === selected)) {
      return selected;
    }

    return swatches[0].hex;
  });

  constructor() {
    // Seed the committed color + draft from the resolved initial color.
    effect(() => {
      const initial = this.initialColor();
      this.#selected.set(initial);
      this.draft.set(initial);
    });
  }

  isSelected(hex: string): boolean {
    return this.selected() === hex;
  }

  /** Commit a swatch from the palette grid. */
  selectSwatch(hex: string): void {
    const normalized = normalizeHex(hex);
    if (!normalized) {
      return;
    }
    this.#focusedHex.set(normalized);
    this.commit(normalized);
  }

  onDraftInput(value: string): void {
    this.draft.set(value);
  }

  /** Commit the hex field if it currently holds a valid color. */
  commitDraft(): void {
    const normalized = normalizeHex(this.draft());
    if (!normalized) {
      // Snap the field back to the last committed value.
      this.draft.set(this.selected());
      return;
    }
    this.draft.set(normalized);
    this.commit(normalized);
  }

  onDraftKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitDraft();
    }
  }

  /** Roving keyboard navigation across the palette grid. */
  onSwatchKeydown(event: KeyboardEvent, hex: string): void {
    const swatches = this.palette();
    const index = swatches.findIndex((swatch) => swatch.hex === hex);
    if (index === -1) {
      return;
    }

    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(index, 1),
      ArrowDown: () => this.moveFocus(index, 1),
      ArrowLeft: () => this.moveFocus(index, -1),
      ArrowUp: () => this.moveFocus(index, -1),
      Home: () => this.focusSwatch(swatches[0].hex),
      End: () => this.focusSwatch(swatches[swatches.length - 1].hex),
      Enter: () => this.selectSwatch(hex),
      ' ': () => this.selectSwatch(hex),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(fromIndex: number, delta: number): void {
    const swatches = this.palette();
    if (swatches.length === 0) {
      return;
    }
    const nextIndex = (fromIndex + delta + swatches.length) % swatches.length;
    this.focusSwatch(swatches[nextIndex].hex);
  }

  private focusSwatch(hex: string): void {
    this.#focusedHex.set(hex);
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-color-picker, synergos-color-picker');
      const root = host?.shadowRoot ?? document;
      const cell = (root as ParentNode).querySelector<HTMLElement>(`[data-hex="${hex}"]`);
      cell?.focus();
    });
  }

  private commit(hex: string): void {
    if (this.#selected() === hex) {
      // Idempotent: re-selecting the active color does not re-emit.
      return;
    }
    this.#selected.set(hex);
    this.colorchange.emit({ color: hex });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
