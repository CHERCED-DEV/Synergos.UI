import {
  type OnInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  IconComponent,
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { SearchBoxProps } from '@synergos/contracts';

/**
 * Runtime config for the CMS element <c>elementSynSearchBox</c>.
 *
 * The shared `@synergos/contracts` package does not (yet) declare a
 * `SearchBoxElementConfig`; the canonical shape lives here next to the
 * component until that contract is added in the registry ola.
 */
export interface SearchBoxRuntimeConfig {
  readonly placeholder?: string;
  readonly label?: string;
  readonly initialQuery?: string;
  readonly debounceMs?: number;
  readonly minChars?: number;
  readonly suggestions?: readonly string[];
}

interface SearchSuggestion {
  readonly id: string;
  readonly label: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeSuggestions(value: unknown): readonly SearchSuggestion[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const suggestions = value
    .map((entry, index): SearchSuggestion | null => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { id: `suggestion-${index}`, label } : null;
      }

      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        const label = readString(record['label']).trim() || readString(record['value']).trim();
        const id = readString(record['id']).trim() || readString(record['value']).trim();
        return label ? { id: id || `suggestion-${index}`, label } : null;
      }

      return null;
    })
    .filter((suggestion): suggestion is SearchSuggestion => suggestion !== null);

  return suggestions.length > 0 ? suggestions : undefined;
}

/**
 * El `config` que manda el CMS tiene la forma de `SearchBoxProps`, GENERADO del record C#
 * (ADR 0135): el texto de ayuda del editor y si buscar recarga la página con `?q` para el listado
 * de al lado, que lo lee en el servidor (CMS#196, tanda D). Antes la vista mandaba
 * `searchPlaceholder`, `searchEndpoint` y `searchParamName`, que este elemento no leía: salía sin
 * texto y lo buscado no le llegaba a nadie. Las sugerencias, el retardo y demás quedan para el tag
 * crudo, por atributos.
 */
export type SearchBoxConfig = Partial<SearchBoxProps>;

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeSearchBoxConfig(value: SearchBoxConfig): SearchBoxConfig {
  return omitUndefinedProperties<SearchBoxProps>({
    placeholder: coerceTrimmedStringInput(value.placeholder),
    submitToPage: coerceOptionalBooleanInput(value.submitToPage),
  });
}

/**
 * Cómo se recarga la página con la búsqueda. Un objeto y no la llamada directa: la `location` de
 * jsdom no se deja reemplazar, y el spec necesita ver ADÓNDE se navega.
 */
export const navegacion = {
  ir(url: string): void {
    location.assign(url);
  },
};

/** El `?q` de la página. */
function consultaDeLaPagina(): string {
  return typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('q') ?? '').trim();
}

let searchBoxInstanceId = 0;

@Component({
  selector: 'sg-search-box',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-search-box' },
})
export class SearchBoxElementComponent implements OnInit {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<SearchBoxConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SearchBoxProps>(sanitizeSearchBoxConfig),
  });
  readonly placeholderInput = input<string | undefined>(undefined, { alias: 'placeholder' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly initialQueryInput = input<string | undefined>(undefined, { alias: 'initialQuery' });
  readonly debounceMsInput = input<number | undefined, unknown>(undefined, {
    alias: 'debounceMs',
    transform: coerceOptionalNumberInput,
  });
  readonly minCharsInput = input<number | undefined, unknown>(undefined, {
    alias: 'minChars',
    transform: coerceOptionalNumberInput,
  });
  readonly suggestionsInput = input<string | undefined>(undefined, { alias: 'suggestions' });

  /**
   * Emits the live (debounced) query as the user types, como el `querychange` CustomEvent.
   *
   * NO se llama `search`: este componente CONTIENE un `<input type="search">`, que dispara un
   * evento `search` nativo (p. ej. al pulsar Escape o la "x" del navegador) que burbujea hasta
   * el host ⇒ sería indistinguible del nuestro. Aquí la colisión no era teórica.
   */
  readonly querychange = output<string>();
  /** Emits when the query is committed (Enter / explicit submit). */
  readonly submitted = output<string>();
  /** Emits when the field is cleared. */
  readonly cleared = output<void>();

  readonly placeholder = computed(() =>
    resolveConfigValue(this.placeholderInput(), this.config()?.placeholder, 'Buscar…'),
  );
  readonly label = computed(() => this.labelInput() ?? '');
  /** Buscar recarga la página con `?q` (lo decide el editor). */
  readonly submitToPage = computed(() => this.config()?.submitToPage ?? false);
  readonly debounceMs = computed(() => {
    const resolved = resolveConfigValue(this.debounceMsInput(), undefined, 250);
    return resolved >= 0 ? resolved : 250;
  });
  readonly minChars = computed(() => {
    const resolved = resolveConfigValue(this.minCharsInput(), undefined, 0);
    return resolved >= 0 ? resolved : 0;
  });

  readonly suggestions = computed<readonly SearchSuggestion[]>(() => {
    if (this.suggestionsInput() !== undefined) {
      const parsed = this.#initialData.parseValue<unknown>(this.suggestionsInput());
      return normalizeSuggestions(parsed) ?? [];
    }

    return [];
  });

  readonly query = signal('');
  readonly suggestionsOpen = signal(false);
  readonly activeSuggestion = signal(-1);

  readonly fieldId = `syn-search-box-${(searchBoxInstanceId += 1)}`;
  readonly listboxId = `${this.fieldId}-listbox`;

  readonly hasQuery = computed(() => this.query().trim().length > 0);
  readonly filteredSuggestions = computed<readonly SearchSuggestion[]>(() => {
    const all = this.suggestions();
    if (all.length === 0) {
      return [];
    }

    const term = this.query().trim().toLowerCase();
    if (!term) {
      return all;
    }

    return all.filter((suggestion) => suggestion.label.toLowerCase().includes(term));
  });
  readonly showSuggestions = computed(
    () => this.suggestionsOpen() && this.filteredSuggestions().length > 0,
  );
  readonly activeDescendantId = computed(() => {
    const index = this.activeSuggestion();
    const items = this.filteredSuggestions();
    if (index < 0 || index >= items.length) {
      return null;
    }

    return `${this.listboxId}-option-${index}`;
  });

  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #initialQuerySeeded = false;

  constructor() {
    this.#destroyRef.onDestroy(() => this.clearDebounce());
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.query.set(target.value);
    this.suggestionsOpen.set(true);
    this.activeSuggestion.set(-1);
    this.scheduleSearch(target.value);
  }

  onFocus(): void {
    if (this.filteredSuggestions().length > 0) {
      this.suggestionsOpen.set(true);
    }

    this.seedInitialQuery();
  }

  onBlur(): void {
    // Defer so a click on a suggestion can register before the list closes.
    setTimeout(() => this.suggestionsOpen.set(false), 120);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.commit(this.query());
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.filteredSuggestions();

    if (event.key === 'ArrowDown' && items.length > 0) {
      event.preventDefault();
      this.suggestionsOpen.set(true);
      this.activeSuggestion.set((this.activeSuggestion() + 1) % items.length);
      return;
    }

    if (event.key === 'ArrowUp' && items.length > 0) {
      event.preventDefault();
      this.suggestionsOpen.set(true);
      const next = this.activeSuggestion() <= 0 ? items.length - 1 : this.activeSuggestion() - 1;
      this.activeSuggestion.set(next);
      return;
    }

    if (event.key === 'Enter') {
      const active = this.activeSuggestion();
      if (this.suggestionsOpen() && active >= 0 && active < items.length) {
        event.preventDefault();
        this.selectSuggestion(items[active]);
      }
      return;
    }

    if (event.key === 'Escape' && this.suggestionsOpen()) {
      event.preventDefault();
      this.suggestionsOpen.set(false);
      this.activeSuggestion.set(-1);
    }
  }

  selectSuggestion(suggestion: SearchSuggestion): void {
    this.query.set(suggestion.label);
    this.suggestionsOpen.set(false);
    this.activeSuggestion.set(-1);
    this.commit(suggestion.label);
  }

  clear(): void {
    this.clearDebounce();
    this.query.set('');
    this.suggestionsOpen.set(false);
    this.activeSuggestion.set(-1);
    this.cleared.emit();
    this.querychange.emit('');
  }

  private seedInitialQuery(): void {
    if (this.#initialQuerySeeded) {
      return;
    }

    const initial = resolveConfigValue(
      this.initialQueryInput(),
      this.submitToPage() ? consultaDeLaPagina() : undefined,
      '',
    );
    if (initial) {
      this.query.set(initial);
    }

    this.#initialQuerySeeded = true;
  }

  /**
   * Fija la búsqueda. Si el editor lo pidió, recarga la página con `?q` —sin él, si se vació— y
   * el listado de la página la lee en el servidor.
   */
  private commit(value: string): void {
    this.clearDebounce();
    const trimmed = value.trim();
    this.querychange.emit(trimmed);
    this.submitted.emit(trimmed);
    if (this.submitToPage() && typeof location !== 'undefined') {
      const url = new URL(location.href);
      if (trimmed) {
        url.searchParams.set('q', trimmed);
      } else {
        url.searchParams.delete('q');
      }
      navegacion.ir(url.toString());
    }
  }

  /**
   * Con `submitToPage`, la caja arranca con lo que se buscó. En `ngOnInit` y no en el constructor:
   * en un custom element el `config` llega después de crear el componente (CMS#194).
   */
  ngOnInit(): void {
    if (this.submitToPage()) {
      this.seedInitialQuery();
    }
  }

  private scheduleSearch(value: string): void {
    this.clearDebounce();
    const trimmed = value.trim();

    if (trimmed.length > 0 && trimmed.length < this.minChars()) {
      return;
    }

    const delay = this.debounceMs();
    if (delay === 0) {
      this.querychange.emit(trimmed);
      return;
    }

    this.#debounceTimer = setTimeout(() => {
      this.querychange.emit(trimmed);
      this.#debounceTimer = null;
    }, delay);
  }

  private clearDebounce(): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }
}
