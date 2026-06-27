import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
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
 * Runtime config for the CMS element <c>elementSynAutocomplete</c>.
 *
 * A single-line text input with a suggestion popup: the visitor types, the
 * component debounces the query, surfaces matching suggestions, and lets the
 * visitor navigate them with the keyboard (Arrow keys / Home / End / Enter /
 * Escape) under a WAI-ARIA combobox + listbox pattern.
 *
 * Suggestions can be supplied inline via `suggestions` (a JSON array of
 * strings or `{ label, value }` records) which are filtered client-side, or
 * fetched lazily from `suggestionsEndpoint` (the debounced query is appended
 * as the `q` parameter and the JSON response is normalized).
 *
 * Selecting a suggestion emits a `suggestionselect` CustomEvent (and the typed
 * Angular output) carrying the chosen label + value.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface AutocompleteRuntimeConfig {
  readonly label?: string;
  readonly placeholder?: string;
  readonly suggestions?: readonly AutocompleteSuggestionConfig[];
  readonly suggestionsEndpoint?: string;
  readonly debounceMs?: number;
  readonly minChars?: number;
  readonly maxSuggestions?: number;
  readonly emptyLabel?: string;
}

export type AutocompleteSuggestionConfig = string | { label?: string; value?: string };

export interface AutocompleteSuggestion {
  readonly label: string;
  readonly value: string;
}

/** Emitted on the `suggestionselect` CustomEvent and the typed Angular output. */
export interface AutocompleteSelectDetail {
  readonly label: string;
  readonly value: string;
}

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_MIN_CHARS = 1;
const DEFAULT_MAX_SUGGESTIONS = 8;
const DEFAULT_PLACEHOLDER = 'Buscar…';
const DEFAULT_EMPTY_LABEL = 'Sin resultados';

let listboxIdCounter = 0;

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

/** Coerce arbitrary input to a clean `{ label, value }` suggestion list. */
export function normalizeSuggestions(value: unknown): readonly AutocompleteSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: AutocompleteSuggestion[] = [];

  for (const entry of value) {
    let label = '';
    let rawValue = '';

    if (typeof entry === 'string' || typeof entry === 'number') {
      label = readString(entry).trim();
      rawValue = label;
    } else if (isRecord(entry)) {
      label = readString(entry['label']).trim();
      rawValue = readString(entry['value']).trim() || label;
      if (!label) {
        label = rawValue;
      }
    }

    if (!label) {
      continue;
    }

    const dedupeKey = `${label}::${rawValue}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    result.push({ label, value: rawValue || label });
  }

  return result;
}

/** Floor a non-negative number, falling back when absent / invalid. */
function clampPositive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function sanitizeAutocompleteConfig(
  value: Partial<AutocompleteRuntimeConfig>,
): AutocompleteRuntimeConfig {
  return omitUndefinedProperties<AutocompleteRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    placeholder: coerceTrimmedStringInput(value.placeholder),
    suggestions: value.suggestions,
    suggestionsEndpoint: coerceTrimmedStringInput(value.suggestionsEndpoint),
    debounceMs: coerceOptionalNumberInput(value.debounceMs),
    minChars: coerceOptionalNumberInput(value.minChars),
    maxSuggestions: coerceOptionalNumberInput(value.maxSuggestions),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
  });
}

@Component({
  selector: 'sg-autocomplete',
  standalone: true,
  templateUrl: './autocomplete.html',
  styleUrl: './autocomplete.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-autocomplete' },
})
export class AutocompleteElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<AutocompleteRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AutocompleteRuntimeConfig>(sanitizeAutocompleteConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly placeholderInput = input<string | undefined>(undefined, { alias: 'placeholder' });
  readonly suggestionsInput = input<string | undefined>(undefined, { alias: 'suggestions' });
  readonly suggestionsEndpointInput = input<string | undefined>(undefined, {
    alias: 'suggestionsEndpoint',
  });
  readonly debounceMsInput = input<string | number | undefined>(undefined, { alias: 'debounceMs' });
  readonly minCharsInput = input<string | number | undefined>(undefined, { alias: 'minChars' });
  readonly maxSuggestionsInput = input<string | number | undefined>(undefined, {
    alias: 'maxSuggestions',
  });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `suggestionselect` CustomEvent. */
  readonly suggestionselect = output<AutocompleteSelectDetail>();

  /** Stable ids for aria-controls / aria-activedescendant wiring. */
  readonly listboxId = `syn-ac-listbox-${++listboxIdCounter}`;
  readonly inputId = `syn-ac-input-${listboxIdCounter}`;

  readonly label = computed(() => resolveConfigValue(this.labelInput(), this.config()?.label, ''));

  readonly placeholder = computed(() =>
    resolveConfigValue(this.placeholderInput(), this.config()?.placeholder, DEFAULT_PLACEHOLDER),
  );

  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, DEFAULT_EMPTY_LABEL),
  );

  readonly debounceMs = computed(() =>
    clampPositive(
      resolveConfigValue(
        coerceOptionalNumberInput(this.debounceMsInput()),
        this.config()?.debounceMs,
        undefined,
      ),
      DEFAULT_DEBOUNCE_MS,
    ),
  );

  readonly minChars = computed(() =>
    clampPositive(
      resolveConfigValue(
        coerceOptionalNumberInput(this.minCharsInput()),
        this.config()?.minChars,
        undefined,
      ),
      DEFAULT_MIN_CHARS,
    ),
  );

  readonly maxSuggestions = computed(() => {
    const resolved = clampPositive(
      resolveConfigValue(
        coerceOptionalNumberInput(this.maxSuggestionsInput()),
        this.config()?.maxSuggestions,
        undefined,
      ),
      DEFAULT_MAX_SUGGESTIONS,
    );
    return resolved > 0 ? resolved : DEFAULT_MAX_SUGGESTIONS;
  });

  readonly suggestionsEndpoint = computed(() =>
    resolveConfigValue(this.suggestionsEndpointInput(), this.config()?.suggestionsEndpoint, ''),
  );

  /** Inline / config suggestions, filtered client-side against the query. */
  readonly inlineSuggestions = computed<readonly AutocompleteSuggestion[]>(() =>
    normalizeSuggestions(this.resolveSource(this.suggestionsInput(), this.config()?.suggestions)),
  );

  /** Suggestions fetched from `suggestionsEndpoint`, set by the fetch effect. */
  readonly #fetchedSuggestions = signal<readonly AutocompleteSuggestion[]>([]);
  readonly #loading = signal(false);
  readonly #fetchFailed = signal(false);
  readonly loading = this.#loading.asReadonly();
  readonly fetchFailed = this.#fetchFailed.asReadonly();

  /** The raw text the visitor has typed. */
  readonly query = signal('');

  /** Debounced mirror of `query`, driven by the debounce effect. */
  readonly #debouncedQuery = signal('');

  /** Whether the suggestion popup is open. */
  readonly open = signal(false);

  /** Index of the active suggestion for keyboard navigation (-1 = none). */
  readonly activeIndex = signal(-1);

  readonly hasEndpoint = computed(() => this.suggestionsEndpoint().trim().length > 0);

  /** The list to present: client-filtered inline, or server results as-is. */
  readonly suggestions = computed<readonly AutocompleteSuggestion[]>(() => {
    const query = this.#debouncedQuery().trim();
    if (query.length < this.minChars()) {
      return [];
    }

    const source = this.hasEndpoint()
      ? this.#fetchedSuggestions()
      : this.filterInline(this.inlineSuggestions(), query);

    return source.slice(0, this.maxSuggestions());
  });

  readonly hasSuggestions = computed(() => this.suggestions().length > 0);

  /** True once the visitor has typed enough to expect results. */
  readonly queryReady = computed(() => this.#debouncedQuery().trim().length >= this.minChars());

  /** Whether the empty-state row should show (typed enough, nothing matched). */
  readonly showEmpty = computed(
    () => this.open() && this.queryReady() && !this.loading() && !this.hasSuggestions(),
  );

  /** The id of the active option for aria-activedescendant, or null. */
  readonly activeOptionId = computed(() => {
    const index = this.activeIndex();
    return index >= 0 && index < this.suggestions().length ? this.optionId(index) : null;
  });

  /** Whether the listbox is currently expanded (drives aria-expanded). */
  readonly expanded = computed(
    () => this.open() && (this.hasSuggestions() || this.showEmpty() || this.loading()),
  );

  constructor() {
    // Debounce the visitor's keystrokes into #debouncedQuery.
    effect((onCleanup) => {
      const query = this.query();
      const delay = this.debounceMs();

      if (typeof setTimeout !== 'function') {
        this.#debouncedQuery.set(query);
        return;
      }

      const handle = setTimeout(() => this.#debouncedQuery.set(query), delay);
      onCleanup(() => clearTimeout(handle));
    });

    // Lazy-fetch suggestions from the endpoint as the debounced query changes.
    effect((onCleanup) => {
      const endpoint = this.suggestionsEndpoint().trim();
      const query = this.#debouncedQuery().trim();

      this.#fetchFailed.set(false);

      if (!endpoint) {
        this.#fetchedSuggestions.set([]);
        this.#loading.set(false);
        return;
      }

      if (query.length < this.minChars() || typeof fetch !== 'function') {
        this.#fetchedSuggestions.set([]);
        this.#loading.set(false);
        return;
      }

      const controller = new AbortController();
      onCleanup(() => controller.abort());

      const url = this.buildEndpointUrl(endpoint, query);
      this.#loading.set(true);
      fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
        )
        .then((data: unknown) => {
          const list = Array.isArray(data)
            ? data
            : isRecord(data)
              ? (data['suggestions'] ?? data['results'] ?? data['items'])
              : null;
          this.#fetchedSuggestions.set(normalizeSuggestions(list));
          this.#loading.set(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          this.#fetchedSuggestions.set([]);
          this.#fetchFailed.set(true);
          this.#loading.set(false);
        });
    });

    // Keep the active index in range as the suggestion list changes.
    effect(() => {
      const count = this.suggestions().length;
      if (this.activeIndex() >= count) {
        this.activeIndex.set(count > 0 ? count - 1 : -1);
      }
    });

    this.#destroyRef.onDestroy(() => {
      // AbortController + setTimeout cleanup handled by effect onCleanup.
    });
  }

  optionId(index: number): string {
    return `${this.listboxId}-opt-${index}`;
  }

  isActive(index: number): boolean {
    return this.activeIndex() === index;
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.query.set(value);
    this.open.set(true);
    this.activeIndex.set(-1);
  }

  onFocus(): void {
    if (this.query().trim().length >= this.minChars()) {
      this.open.set(true);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.openAndMove(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.openAndMove(-1);
        break;
      case 'Home':
        if (this.open() && this.hasSuggestions()) {
          event.preventDefault();
          this.activeIndex.set(0);
        }
        break;
      case 'End':
        if (this.open() && this.hasSuggestions()) {
          event.preventDefault();
          this.activeIndex.set(this.suggestions().length - 1);
        }
        break;
      case 'Enter': {
        const index = this.activeIndex();
        if (this.open() && index >= 0 && index < this.suggestions().length) {
          event.preventDefault();
          this.selectByIndex(index);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.close();
        }
        break;
      default:
        break;
    }
  }

  selectByIndex(index: number): void {
    const suggestion = this.suggestions()[index];
    if (!suggestion) {
      return;
    }
    this.select(suggestion);
  }

  select(suggestion: AutocompleteSuggestion): void {
    this.query.set(suggestion.label);
    this.#debouncedQuery.set(suggestion.label);
    this.close();
    this.suggestionselect.emit({ label: suggestion.label, value: suggestion.value });
  }

  /** Close the popup (e.g. on blur / outside click / Escape). */
  close(): void {
    this.open.set(false);
    this.activeIndex.set(-1);
  }

  private openAndMove(delta: number): void {
    if (!this.open()) {
      this.open.set(true);
    }

    const count = this.suggestions().length;
    if (count === 0) {
      this.activeIndex.set(-1);
      return;
    }

    const current = this.activeIndex();
    const next = current < 0 ? (delta > 0 ? 0 : count - 1) : (current + delta + count) % count;
    this.activeIndex.set(next);
  }

  private filterInline(
    source: readonly AutocompleteSuggestion[],
    query: string,
  ): readonly AutocompleteSuggestion[] {
    const needle = query.toLowerCase();
    if (!needle) {
      return source;
    }
    return source.filter((suggestion) => suggestion.label.toLowerCase().includes(needle));
  }

  private buildEndpointUrl(endpoint: string, query: string): string {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}q=${encodeURIComponent(query)}`;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
