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
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynAccordion</c>.
 *
 * A collapsible accordion: a vertical stack of header/panel pairs. Each item
 * can be expanded or collapsed. In single-expand mode (default) opening one
 * item closes the rest; in multi-expand mode several panels stay open at once.
 * Headers form a roving-tabindex toolbar with full keyboard support
 * (Arrow/Home/End/Enter/Space) and the WAI-ARIA Accordion pattern
 * (button[aria-expanded] controlling region[aria-labelledby]).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface AccordionRuntimeConfig {
  readonly items?: readonly AccordionItemConfig[];
  readonly allowMultiple?: boolean;
  readonly headingLevel?: number;
}

export interface AccordionItemConfig {
  readonly id?: string;
  readonly title?: string;
  readonly body?: string;
  readonly open?: boolean;
}

export interface AccordionItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly defaultOpen: boolean;
}

/** Emitted on the `itemtoggle` CustomEvent and the typed Angular output. */
export interface AccordionToggleDetail {
  readonly id: string;
  readonly expanded: boolean;
  readonly expandedIds: readonly string[];
}

const MIN_HEADING_LEVEL = 2;
const MAX_HEADING_LEVEL = 6;
const DEFAULT_HEADING_LEVEL = 3;

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

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function clampHeadingLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_HEADING_LEVEL;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_HEADING_LEVEL) {
    return MIN_HEADING_LEVEL;
  }
  if (rounded > MAX_HEADING_LEVEL) {
    return MAX_HEADING_LEVEL;
  }
  return rounded;
}

/** Coerce arbitrary input into a clean, deduplicated list of accordion items. */
export function normalizeItems(value: unknown): readonly AccordionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const items: AccordionItem[] = [];

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }

    const title = readString(entry['title']).trim();
    const body = readString(entry['body']).trim() || readString(entry['content']).trim();
    if (!title) {
      return;
    }

    let id = readString(entry['id']).trim();
    if (!id || seen.has(id)) {
      id = `accordion-item-${index}`;
    }
    if (seen.has(id)) {
      return;
    }
    seen.add(id);

    items.push({
      id,
      title,
      body,
      defaultOpen: readBoolean(entry['open']),
    });
  });

  return items;
}

function sanitizeAccordionConfig(value: Partial<AccordionRuntimeConfig>): AccordionRuntimeConfig {
  return omitUndefinedProperties<AccordionRuntimeConfig>({
    items: value.items,
    allowMultiple: coerceOptionalBooleanInput(value.allowMultiple),
    headingLevel: typeof value.headingLevel === 'number' ? value.headingLevel : undefined,
  });
}

@Component({
  selector: 'sg-accordion',
  standalone: true,
  templateUrl: './accordion.html',
  styleUrl: './accordion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-accordion' },
})
export class AccordionElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<AccordionRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AccordionRuntimeConfig>(sanitizeAccordionConfig),
  });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly itemsJsonInput = input<string | undefined>(undefined, { alias: 'itemsJson' });
  readonly allowMultipleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'allowMultiple',
    transform: coerceOptionalBooleanInput,
  });
  readonly headingLevelInput = input<string | number | undefined>(undefined, {
    alias: 'headingLevel',
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `itemtoggle` CustomEvent. */
  readonly itemtoggle = output<AccordionToggleDetail>();

  readonly allowMultiple = computed(() =>
    resolveConfigValue(this.allowMultipleInput(), this.config()?.allowMultiple, false),
  );

  readonly headingLevel = computed(() => {
    const raw = resolveConfigValue<number | string | undefined>(
      this.headingLevelInput(),
      this.config()?.headingLevel,
      DEFAULT_HEADING_LEVEL,
    );
    const numeric = typeof raw === 'string' ? Number(raw) : raw;
    return clampHeadingLevel(numeric);
  });

  readonly items = computed<readonly AccordionItem[]>(() =>
    normalizeItems(
      this.resolveSource(this.itemsInput() ?? this.itemsJsonInput(), this.config()?.items),
    ),
  );

  readonly hasItems = computed(() => this.items().length > 0);

  /** Ids currently expanded. Seeded once from each item's `open` flag. */
  readonly #expandedIds = signal<readonly string[] | null>(null);

  /** Resolved expanded set: explicit user state, else seeded defaults. */
  readonly expandedIds = computed<readonly string[]>(() => {
    const explicit = this.#expandedIds();
    const valid = new Set(this.items().map((item) => item.id));

    const source =
      explicit ?? this.items().filter((item) => item.defaultOpen).map((item) => item.id);

    const filtered = source.filter((id) => valid.has(id));
    return this.allowMultiple() ? filtered : filtered.slice(0, 1);
  });

  /** Header that holds keyboard focus inside the accordion (roving tabindex). */
  readonly #focusedId = signal<string | null>(null);

  readonly focusedId = computed<string>(() => {
    const focused = this.#focusedId();
    const items = this.items();
    if (focused && items.some((item) => item.id === focused)) {
      return focused;
    }
    return items[0]?.id ?? '';
  });

  isExpanded(item: AccordionItem): boolean {
    return this.expandedIds().includes(item.id);
  }

  panelId(item: AccordionItem): string {
    return `${item.id}__panel`;
  }

  headerId(item: AccordionItem): string {
    return `${item.id}__header`;
  }

  toggle(item: AccordionItem): void {
    const current = this.expandedIds();
    const isOpen = current.includes(item.id);

    let next: string[];
    if (this.allowMultiple()) {
      next = isOpen ? current.filter((id) => id !== item.id) : [...current, item.id];
    } else {
      next = isOpen ? [] : [item.id];
    }

    this.#expandedIds.set(next);
    this.#focusedId.set(item.id);

    const detail: AccordionToggleDetail = {
      id: item.id,
      expanded: !isOpen,
      expandedIds: next,
    };
    this.itemtoggle.emit(detail);
  }

  /** Roving keyboard navigation across accordion headers. */
  onHeaderKeydown(event: KeyboardEvent, item: AccordionItem): void {
    const handlers: Record<string, () => void> = {
      ArrowDown: () => this.moveFocus(item.id, 1),
      ArrowUp: () => this.moveFocus(item.id, -1),
      Home: () => this.moveFocusToEdge('start'),
      End: () => this.moveFocusToEdge('end'),
      Enter: () => this.toggle(item),
      ' ': () => this.toggle(item),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(fromId: string, delta: number): void {
    const items = this.items();
    const index = items.findIndex((item) => item.id === fromId);
    if (index < 0) {
      return;
    }
    const count = items.length;
    const nextIndex = (index + delta + count) % count;
    const next = items[nextIndex];
    if (next) {
      this.focusHeader(next.id);
    }
  }

  private moveFocusToEdge(edge: 'start' | 'end'): void {
    const items = this.items();
    if (items.length === 0) {
      return;
    }
    const target = edge === 'start' ? items[0] : items[items.length - 1];
    this.focusHeader(target.id);
  }

  private focusHeader(id: string): void {
    this.#focusedId.set(id);
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-accordion, synergos-accordion');
      const root = host?.shadowRoot ?? document;
      const button = (root as ParentNode).querySelector<HTMLElement>(`[data-id="${id}"]`);
      button?.focus();
    });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
