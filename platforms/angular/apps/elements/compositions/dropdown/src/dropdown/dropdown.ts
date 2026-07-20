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
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynDropdown</c>.
 *
 * A trigger button that opens an accessible menu of items. Items can be
 * plain actions (emit an `itemselect` CustomEvent) or links (navigate via href).
 * Supports full keyboard control (Arrow/Home/End/typeahead/Escape), a
 * roving-focus `aria-activedescendant`-free roving tabindex menu, optional
 * inline search filtering, and outside-click / Escape dismissal.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface DropdownRuntimeConfig {
  readonly triggerLabel?: string;
  readonly options?: readonly DropdownItemConfig[];
  readonly selectedValue?: string;
  readonly searchable?: boolean;
}

export interface DropdownItemConfig {
  readonly value?: string;
  readonly label?: string;
  readonly href?: string;
  readonly disabled?: boolean;
}

export interface DropdownItem {
  readonly value: string;
  readonly label: string;
  readonly href: string;
  readonly disabled: boolean;
}

/** Emitted on the `itemselect` CustomEvent and the typed Angular output. */
export interface DropdownSelectDetail {
  readonly value: string;
  readonly label: string;
  readonly href: string;
}

const DEFAULT_TRIGGER_LABEL = 'Opciones';

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

/** Coerce arbitrary CMS / config data into a clean list of menu items. */
export function normalizeItems(value: unknown): readonly DropdownItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((entry, index): DropdownItem | null => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { value: label, label, href: '', disabled: false } : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const label = readString(entry['label']).trim() || readString(entry['value']).trim();
      if (!label) {
        return null;
      }

      const rawValue = readString(entry['value']).trim() || label;
      // Keep values unique so selection / typeahead stay deterministic.
      const value = seen.has(rawValue) ? `${rawValue}-${index}` : rawValue;
      seen.add(value);

      return {
        value,
        label,
        href: readString(entry['href']).trim() || readString(entry['url']).trim(),
        disabled: coerceOptionalBooleanInput(entry['disabled']) === true,
      };
    })
    .filter((item): item is DropdownItem => item !== null);
}

function sanitizeDropdownConfig(value: Partial<DropdownRuntimeConfig>): DropdownRuntimeConfig {
  return omitUndefinedProperties<DropdownRuntimeConfig>({
    triggerLabel: coerceTrimmedStringInput(value.triggerLabel),
    options: value.options,
    selectedValue: coerceTrimmedStringInput(value.selectedValue),
    searchable: coerceOptionalBooleanInput(value.searchable),
  });
}

@Component({
  selector: 'sg-dropdown',
  standalone: true,
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-dropdown',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onDocumentEscape()',
  },
})
export class DropdownElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<DropdownRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DropdownRuntimeConfig>(sanitizeDropdownConfig),
  });
  readonly triggerLabelInput = input<string | undefined>(undefined, { alias: 'triggerLabel' });
  readonly optionsJsonInput = input<string | undefined>(undefined, { alias: 'optionsJson' });
  readonly selectedValueInput = input<string | undefined>(undefined, { alias: 'selectedValue' });
  readonly searchableInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'searchable',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /**
   * Emitted as the `itemselect` CustomEvent.
   *
   * NO se llama `select`: ese es un evento DOM nativo (lo dispara `<input>`/`<textarea>` al
   * seleccionar texto) y, al burbujear hasta el host del custom element, sería
   * indistinguible del nuestro. Convención de la casa: nombre compuesto en minúscula.
   */
  readonly itemselect = output<DropdownSelectDetail>();

  /** Stable ids so trigger/menu can reference each other via aria. */
  readonly triggerId = `syn-dropdown-trigger-${nextId()}`;
  readonly menuId = `syn-dropdown-menu-${nextId()}`;

  readonly triggerLabel = computed(() =>
    resolveConfigValue(this.triggerLabelInput(), this.config()?.triggerLabel, DEFAULT_TRIGGER_LABEL),
  );

  readonly searchable = computed(() =>
    resolveConfigValue(this.searchableInput(), this.config()?.searchable, false),
  );

  readonly items = computed<readonly DropdownItem[]>(() =>
    normalizeItems(this.resolveSource(this.optionsJsonInput(), this.config()?.options)),
  );

  readonly hasItems = computed(() => this.items().length > 0);

  /** Currently selected value (drives the checkmark + trigger summary). */
  readonly selectedValue = signal<string | null>(null);

  /** Open / closed state of the menu. */
  readonly #open = signal(false);
  readonly open = this.#open.asReadonly();

  /** Live search query (only relevant when `searchable` is true). */
  readonly query = signal('');

  /** Value of the item that currently holds roving keyboard focus. */
  readonly #activeValue = signal<string | null>(null);

  readonly visibleItems = computed<readonly DropdownItem[]>(() => {
    const query = this.searchable() ? this.query().trim().toLowerCase() : '';
    if (!query) {
      return this.items();
    }
    return this.items().filter((item) => item.label.toLowerCase().includes(query));
  });

  /** The label shown on the trigger: selected item's label, else the title. */
  readonly triggerText = computed(() => {
    const selected = this.selectedItem();
    return selected ? selected.label : this.triggerLabel();
  });

  readonly selectedItem = computed<DropdownItem | null>(() => {
    const value = this.selectedValue();
    if (value === null) {
      return null;
    }
    return this.items().find((item) => item.value === value) ?? null;
  });

  /** Value carrying tabindex=0 inside the menu (roving). */
  readonly activeValue = computed<string | null>(() => {
    const visible = this.visibleItems();
    if (visible.length === 0) {
      return null;
    }

    const active = this.#activeValue();
    if (active && visible.some((item) => item.value === active && !item.disabled)) {
      return active;
    }

    const selected = this.selectedValue();
    if (selected && visible.some((item) => item.value === selected && !item.disabled)) {
      return selected;
    }

    return visible.find((item) => !item.disabled)?.value ?? null;
  });

  constructor() {
    // Sync the configured selection into local state when it changes.
    effect(() => {
      const configured = resolveConfigValue(
        this.selectedValueInput(),
        this.config()?.selectedValue,
        '',
      ).trim();
      this.selectedValue.set(configured ? configured : null);
    });

    this.#destroyRef.onDestroy(() => {
      this.#open.set(false);
    });
  }

  toggle(): void {
    if (this.#open()) {
      this.close();
    } else {
      this.openMenu();
    }
  }

  openMenu(): void {
    if (!this.hasItems()) {
      return;
    }
    this.#open.set(true);
    this.#activeValue.set(this.activeValue());
    this.focusActiveItem();
  }

  close(focusTrigger = false): void {
    if (!this.#open()) {
      return;
    }
    this.#open.set(false);
    this.query.set('');
    if (focusTrigger) {
      this.focusTrigger();
    }
  }

  selectItem(item: DropdownItem): void {
    if (item.disabled) {
      return;
    }

    this.selectedValue.set(item.value);
    this.#activeValue.set(item.value);

    const detail: DropdownSelectDetail = {
      value: item.value,
      label: item.label,
      href: item.href,
    };
    this.itemselect.emit(detail);

    this.close(true);
  }

  isSelected(item: DropdownItem): boolean {
    return this.selectedValue() === item.value;
  }

  isActive(item: DropdownItem): boolean {
    return this.activeValue() === item.value;
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.query.set(target?.value ?? '');
    // Reset roving focus to the first match after filtering.
    this.#activeValue.set(this.visibleItems().find((item) => !item.disabled)?.value ?? null);
  }

  /** Keyboard handling on the trigger button. */
  onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.openMenu();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.openMenu();
        this.moveActive('end');
        break;
      default:
        break;
    }
  }

  /** Roving keyboard navigation inside the open menu. */
  onItemKeydown(event: KeyboardEvent, item: DropdownItem): void {
    const handlers: Record<string, () => void> = {
      ArrowDown: () => this.moveActive(1),
      ArrowUp: () => this.moveActive(-1),
      Home: () => this.moveActive('start'),
      End: () => this.moveActive('end'),
      Enter: () => this.selectItem(item),
      ' ': () => this.selectItem(item),
      Escape: () => this.close(true),
      Tab: () => this.close(),
    };

    const handler = handlers[event.key];
    if (handler) {
      if (event.key !== 'Tab') {
        event.preventDefault();
      }
      handler();
      return;
    }

    // Typeahead: jump to the next item whose label starts with the key.
    if (event.key.length === 1 && /\S/.test(event.key)) {
      this.typeahead(event.key);
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.#open()) {
      return;
    }
    const host = this.hostElement(event);
    const target = event.target as Node | null;
    if (host && target && !host.contains(target)) {
      this.close();
    }
  }

  onDocumentEscape(): void {
    this.close(true);
  }

  /** Move focus from the search box into the first enabled menu item. */
  focusFirst(): void {
    this.moveActive('start');
  }

  private moveActive(target: number | 'start' | 'end'): void {
    const enabled = this.visibleItems().filter((item) => !item.disabled);
    if (enabled.length === 0) {
      return;
    }

    let nextIndex: number;
    if (target === 'start') {
      nextIndex = 0;
    } else if (target === 'end') {
      nextIndex = enabled.length - 1;
    } else {
      const current = enabled.findIndex((item) => item.value === this.activeValue());
      const base = current === -1 ? (target > 0 ? -1 : 0) : current;
      nextIndex = (base + target + enabled.length) % enabled.length;
    }

    const next = enabled[nextIndex];
    this.#activeValue.set(next.value);
    this.focusActiveItem();
  }

  private typeahead(char: string): void {
    const enabled = this.visibleItems().filter((item) => !item.disabled);
    if (enabled.length === 0) {
      return;
    }
    const lower = char.toLowerCase();
    const current = enabled.findIndex((item) => item.value === this.activeValue());
    // Search after the current item, wrapping around.
    for (let offset = 1; offset <= enabled.length; offset++) {
      const candidate = enabled[(current + offset + enabled.length) % enabled.length];
      if (candidate.label.toLowerCase().startsWith(lower)) {
        this.#activeValue.set(candidate.value);
        this.focusActiveItem();
        return;
      }
    }
  }

  private focusActiveItem(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    const value = this.activeValue();
    if (!value) {
      return;
    }
    requestAnimationFrame(() => {
      const root = this.shadowRootOrDocument();
      const cell = root.querySelector<HTMLElement>(`[data-value="${cssEscape(value)}"]`);
      cell?.focus();
    });
  }

  private focusTrigger(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const root = this.shadowRootOrDocument();
      root.querySelector<HTMLElement>(`#${this.triggerId}`)?.focus();
    });
  }

  private hostElement(event: Event): HTMLElement | null {
    // Prefer the composed-path host (works through shadow DOM); fall back to tag.
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof HTMLElement && (node.matches('sg-dropdown') || node.matches('synergos-dropdown'))) {
        return node;
      }
    }
    return document.querySelector<HTMLElement>('sg-dropdown, synergos-dropdown');
  }

  private shadowRootOrDocument(): ParentNode {
    const host = document.querySelector('sg-dropdown, synergos-dropdown');
    return host?.shadowRoot ?? document;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}

let idCounter = 0;
function nextId(): number {
  idCounter += 1;
  return idCounter;
}

/** Minimal CSS attribute-selector escaping for the data-value lookup. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
