import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSelectMulti</c>.
 *
 * An accessible multi-select: a searchable, keyboard-navigable
 * `role="listbox"` (multiselectable) whose chosen values render as
 * removable chips. Built for faceted forms and tag pickers across the
 * verticals. Options are supplied inline via `optionsJson` (or `options`
 * in the config object). Each commit emits a `selectionchange`
 * CustomEvent carrying the selected values.
 *
 * Bridge contract: every CMS property is a TypeScript input with the
 * same alias. A `config` object (JSON) is also accepted; explicit
 * attributes win over `config`, which wins over defaults (see
 * `resolveConfigValue`).
 */
export interface SelectMultiRuntimeConfig {
  readonly label?: string;
  readonly placeholder?: string;
  readonly emptyLabel?: string;
  readonly maxSelections?: number;
  readonly options?: readonly SelectMultiOptionConfig[];
}

export interface SelectMultiOptionConfig {
  readonly value?: string;
  readonly label?: string;
  readonly disabled?: boolean;
}

export interface SelectMultiOption {
  readonly value: string;
  readonly label: string;
  readonly disabled: boolean;
}

/** Emitted on the `selectionchange` CustomEvent and the typed output. */
export interface SelectMultiChangeDetail {
  readonly values: readonly string[];
  readonly options: readonly SelectMultiOption[];
}

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

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

export function normalizeOptions(value: unknown): readonly SelectMultiOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: SelectMultiOption[] = [];

  for (const entry of value) {
    let option: SelectMultiOption | null = null;

    if (typeof entry === 'string' || typeof entry === 'number') {
      const label = readString(entry).trim();
      if (label) {
        option = { value: label, label, disabled: false };
      }
    } else if (isRecord(entry)) {
      const rawValue = readString(entry['value']).trim();
      const label = readString(entry['label']).trim() || rawValue;
      const resolvedValue = rawValue || label;
      if (resolvedValue) {
        option = {
          value: resolvedValue,
          label: label || resolvedValue,
          disabled: readBoolean(entry['disabled']),
        };
      }
    }

    if (option && !seen.has(option.value)) {
      seen.add(option.value);
      result.push(option);
    }
  }

  return result;
}

function sanitizeSelectMultiConfig(
  value: Partial<SelectMultiRuntimeConfig>,
): SelectMultiRuntimeConfig {
  return omitUndefinedProperties<SelectMultiRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    placeholder: coerceTrimmedStringInput(value.placeholder),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    maxSelections: coerceOptionalNumberInput(value.maxSelections),
    options: value.options,
  });
}

@Component({
  selector: 'sg-select-multi',
  standalone: true,
  templateUrl: './select-multi.html',
  styleUrl: './select-multi.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-select-multi' },
})
export class SelectMultiElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<SelectMultiRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SelectMultiRuntimeConfig>(sanitizeSelectMultiConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly placeholderInput = input<string | undefined>(undefined, { alias: 'placeholder' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly optionsJsonInput = input<string | undefined>(undefined, { alias: 'optionsJson' });
  readonly maxSelectionsInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxSelections',
    transform: coerceOptionalNumberInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `selectionchange` event. */
  readonly selectionchange = output<SelectMultiChangeDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly placeholder = computed(() =>
    resolveConfigValue(this.placeholderInput(), this.config()?.placeholder, 'Buscar opciones…'),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, 'Sin coincidencias.'),
  );

  /** 0 (or negative) means unlimited selections. */
  readonly maxSelections = computed(() => {
    const resolved = resolveConfigValue(this.maxSelectionsInput(), this.config()?.maxSelections, 0);
    return Number.isFinite(resolved) && resolved > 0 ? Math.floor(resolved) : 0;
  });

  readonly options = computed<readonly SelectMultiOption[]>(() =>
    normalizeOptions(this.resolveSource(this.optionsJsonInput(), this.config()?.options)),
  );

  readonly #optionsByValue = computed<Map<string, SelectMultiOption>>(() => {
    const index = new Map<string, SelectMultiOption>();
    for (const option of this.options()) {
      index.set(option.value, option);
    }
    return index;
  });

  /** Free-text search query bound to the input. */
  readonly query = signal('');

  /** Whether the listbox popup is open. */
  readonly open = signal(false);

  /** Set of currently selected option values (insertion order preserved). */
  readonly #selected = signal<readonly string[]>([]);

  /** Option that holds virtual keyboard focus (aria-activedescendant). */
  readonly activeValue = signal<string | null>(null);

  readonly hasLabel = computed(() => this.label().trim().length > 0);

  readonly selectedValues = this.#selected.asReadonly();

  readonly selectedOptions = computed<readonly SelectMultiOption[]>(() => {
    const index = this.#optionsByValue();
    return this.#selected()
      .map((value) => index.get(value))
      .filter((option): option is SelectMultiOption => option !== undefined);
  });

  readonly hasSelection = computed(() => this.selectedOptions().length > 0);

  /** Options matching the query (case/diacritic-insensitive). */
  readonly filteredOptions = computed<readonly SelectMultiOption[]>(() => {
    const needle = this.#fold(this.query().trim());
    const all = this.options();
    if (!needle) {
      return all;
    }
    return all.filter((option) => this.#fold(option.label).includes(needle));
  });

  readonly hasResults = computed(() => this.filteredOptions().length > 0);

  /** True when the selection cap has been reached (cap > 0). */
  readonly atCapacity = computed(() => {
    const max = this.maxSelections();
    return max > 0 && this.#selected().length >= max;
  });

  readonly capacityHint = computed(() => {
    const max = this.maxSelections();
    if (max <= 0) {
      return '';
    }
    return `${this.#selected().length} / ${max} seleccionadas`;
  });

  isSelected(option: SelectMultiOption): boolean {
    return this.#selected().includes(option.value);
  }

  /** An option is pickable when not disabled and not blocked by the cap. */
  isPickable(option: SelectMultiOption): boolean {
    if (option.disabled) {
      return false;
    }
    return this.isSelected(option) || !this.atCapacity();
  }

  onQueryInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    const active = this.activeValue();
    const visible = this.filteredOptions();
    if (!active || !visible.some((option) => option.value === active)) {
      this.activeValue.set(visible[0]?.value ?? null);
    }
  }

  openListbox(): void {
    if (this.open()) {
      return;
    }
    this.open.set(true);
    if (!this.activeValue()) {
      this.activeValue.set(this.filteredOptions()[0]?.value ?? null);
    }
  }

  closeListbox(): void {
    this.open.set(false);
  }

  toggleOption(option: SelectMultiOption): void {
    if (option.disabled) {
      return;
    }

    const current = this.#selected();
    if (current.includes(option.value)) {
      this.#commit(current.filter((value) => value !== option.value));
      return;
    }

    if (this.atCapacity()) {
      return;
    }

    this.#commit([...current, option.value]);
  }

  removeOption(option: SelectMultiOption): void {
    const current = this.#selected();
    if (!current.includes(option.value)) {
      return;
    }
    this.#commit(current.filter((value) => value !== option.value));
  }

  clearSelection(): void {
    if (this.#selected().length === 0) {
      return;
    }
    this.#commit([]);
  }

  /** Keyboard handling on the search input / combobox. */
  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.openListbox();
        this.#moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.openListbox();
        this.#moveActive(-1);
        break;
      case 'Home':
        if (this.open()) {
          event.preventDefault();
          this.activeValue.set(this.filteredOptions()[0]?.value ?? null);
        }
        break;
      case 'End':
        if (this.open()) {
          event.preventDefault();
          const visible = this.filteredOptions();
          this.activeValue.set(visible[visible.length - 1]?.value ?? null);
        }
        break;
      case 'Enter':
        if (this.open()) {
          event.preventDefault();
          this.#toggleActive();
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.closeListbox();
        } else if (this.query()) {
          event.preventDefault();
          this.query.set('');
        }
        break;
      case 'Backspace':
        if (!this.query() && this.hasSelection()) {
          event.preventDefault();
          const selected = this.selectedOptions();
          this.removeOption(selected[selected.length - 1]);
        }
        break;
      default:
        break;
    }
  }

  optionId(option: SelectMultiOption): string {
    return `option-${option.value}`;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }

  #moveActive(delta: number): void {
    const visible = this.filteredOptions();
    if (visible.length === 0) {
      this.activeValue.set(null);
      return;
    }

    const currentIndex = visible.findIndex((option) => option.value === this.activeValue());
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : visible.length - 1
        : (currentIndex + delta + visible.length) % visible.length;

    this.activeValue.set(visible[nextIndex].value);
  }

  #toggleActive(): void {
    const active = this.activeValue();
    if (!active) {
      return;
    }
    const option = this.#optionsByValue().get(active);
    if (option) {
      this.toggleOption(option);
    }
  }

  #commit(values: readonly string[]): void {
    this.#selected.set(values);
    const index = this.#optionsByValue();
    const options = values
      .map((value) => index.get(value))
      .filter((option): option is SelectMultiOption => option !== undefined);
    this.selectionchange.emit({ values: [...values], options });
  }

  /** Lowercase + strip diacritics for accent-insensitive matching. */
  #fold(value: string): string {
    return value
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }
}
