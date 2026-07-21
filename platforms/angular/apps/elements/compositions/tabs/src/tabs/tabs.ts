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
 * Runtime config for the CMS element <c>elementSynTabs</c>.
 *
 * A primitive, accessible tabs composition: a `tablist` of `tab` buttons
 * driving sibling `tabpanel` regions. Keyboard support follows the WAI-ARIA
 * Authoring Practices tabs pattern — roving tabindex, Arrow keys to move,
 * Home/End to jump to the first/last tab. Activation is automatic (focus
 * selects). Selecting a tab emits a `tabchange` CustomEvent carrying the
 * active tab id and index.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface TabsRuntimeConfig {
  readonly tabs?: readonly TabConfig[];
  readonly initialTab?: string;
  readonly orientation?: string;
}

export interface TabConfig {
  readonly id?: string;
  readonly label?: string;
  readonly content?: string;
  readonly disabled?: boolean;
}

export interface Tab {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled: boolean;
  readonly tabId: string;
  readonly panelId: string;
}

/** Emitted on the `tabchange` CustomEvent and the typed Angular output. */
export interface TabChangeDetail {
  readonly id: string;
  readonly index: number;
}

export type TabsOrientation = 'horizontal' | 'vertical';

const ORIENTATIONS: readonly TabsOrientation[] = ['horizontal', 'vertical'];
const DEFAULT_ORIENTATION: TabsOrientation = 'horizontal';

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
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

/** Coerce a label into a DOM-safe id segment. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeOrientation(value: unknown): TabsOrientation {
  const candidate = readString(value).trim().toLowerCase() as TabsOrientation;
  return ORIENTATIONS.includes(candidate) ? candidate : DEFAULT_ORIENTATION;
}

export function normalizeTabs(value: unknown): readonly Tab[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((entry, index): Tab | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }

      const rawId = readString(entry['id']).trim() || slugify(label) || `tab-${index}`;
      let id = rawId;
      let suffix = 2;
      while (seen.has(id)) {
        id = `${rawId}-${suffix++}`;
      }
      seen.add(id);

      return {
        id,
        label,
        content: readString(entry['content']),
        disabled: readBoolean(entry['disabled']),
        tabId: `syn-tab-${id}`,
        panelId: `syn-tabpanel-${id}`,
      };
    })
    .filter((tab): tab is Tab => tab !== null);
}

function sanitizeTabsConfig(value: Partial<TabsRuntimeConfig>): TabsRuntimeConfig {
  return omitUndefinedProperties<TabsRuntimeConfig>({
    tabs: value.tabs,
    initialTab: coerceTrimmedStringInput(value.initialTab),
    orientation: coerceTrimmedStringInput(value.orientation),
  });
}

@Component({
  selector: 'sg-tabs',
  standalone: true,
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tabs', '[attr.data-orientation]': 'orientation()' },
})
export class TabsElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<TabsRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TabsRuntimeConfig>(sanitizeTabsConfig),
  });
  readonly tabsJson = input<string | undefined>(undefined, { alias: 'tabsJson' });
  readonly initialTabInput = input<string | undefined>(undefined, { alias: 'initialTab' });
  readonly orientationInput = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `tabchange` CustomEvent. */
  readonly tabchange = output<TabChangeDetail>();

  readonly orientation = computed<TabsOrientation>(() =>
    normalizeOrientation(
      resolveConfigValue(this.orientationInput(), this.config()?.orientation, DEFAULT_ORIENTATION),
    ),
  );

  readonly tabs = computed<readonly Tab[]>(() =>
    normalizeTabs(this.resolveSource(this.tabsJson(), this.config()?.tabs)),
  );

  /** Tabs the visitor can actually reach (enabled). */
  readonly enabledTabs = computed<readonly Tab[]>(() => this.tabs().filter((tab) => !tab.disabled));

  readonly hasTabs = computed(() => this.tabs().length > 0);

  /** Active tab id; null until resolved against the available tabs. */
  readonly #activeId = signal<string | null>(null);

  /** Tab id that should hold keyboard focus inside the tablist (roving). */
  readonly #focusedId = signal<string | null>(null);

  /** The configured initial selection, falling back to the first enabled tab. */
  readonly #defaultActiveId = computed<string>(() => {
    const tabs = this.tabs();
    if (tabs.length === 0) {
      return '';
    }

    const requested = resolveConfigValue(
      this.initialTabInput(),
      this.config()?.initialTab,
      '',
    ).trim();
    const requestedTab = tabs.find((tab) => tab.id === requested && !tab.disabled);
    if (requestedTab) {
      return requestedTab.id;
    }

    const firstEnabled = tabs.find((tab) => !tab.disabled);
    return firstEnabled?.id ?? tabs[0].id;
  });

  /** Resolved active id (explicit selection wins, else the default). */
  readonly activeId = computed<string>(() => {
    const active = this.#activeId();
    if (active && this.tabs().some((tab) => tab.id === active && !tab.disabled)) {
      return active;
    }
    return this.#defaultActiveId();
  });

  readonly activeIndex = computed<number>(() =>
    this.tabs().findIndex((tab) => tab.id === this.activeId()),
  );

  /** Tab id that carries tabindex=0 (roving). */
  readonly focusedId = computed<string>(() => {
    const focused = this.#focusedId();
    if (focused && this.tabs().some((tab) => tab.id === focused && !tab.disabled)) {
      return focused;
    }
    return this.activeId();
  });

  constructor() {
    // Reset the explicit selection whenever the tab set or initial changes so
    // the resolved default is honored again.
    effect(() => {
      this.#defaultActiveId();
      this.#activeId.set(null);
      this.#focusedId.set(null);
    });
  }

  isActive(tab: Tab): boolean {
    return tab.id === this.activeId();
  }

  selectTab(tab: Tab): void {
    if (tab.disabled || tab.id === this.activeId()) {
      this.#focusedId.set(tab.id);
      return;
    }

    this.#activeId.set(tab.id);
    this.#focusedId.set(tab.id);

    const index = this.tabs().findIndex((entry) => entry.id === tab.id);
    this.tabchange.emit({ id: tab.id, index });
  }

  /** Roving keyboard navigation across the tablist (APG tabs pattern). */
  onTabKeydown(event: KeyboardEvent, tab: Tab): void {
    const orientation = this.orientation();
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

    const handlers: Record<string, () => void> = {
      [nextKey]: () => this.moveFocus(tab.id, 1),
      [prevKey]: () => this.moveFocus(tab.id, -1),
      Home: () => this.moveFocusToEdge('start'),
      End: () => this.moveFocusToEdge('end'),
      Enter: () => this.selectTab(tab),
      ' ': () => this.selectTab(tab),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(fromId: string, delta: number): void {
    const enabled = this.enabledTabs();
    if (enabled.length === 0) {
      return;
    }

    const currentIndex = enabled.findIndex((tab) => tab.id === fromId);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (baseIndex + delta + enabled.length) % enabled.length;
    this.activateByFocus(enabled[nextIndex]);
  }

  private moveFocusToEdge(edge: 'start' | 'end'): void {
    const enabled = this.enabledTabs();
    if (enabled.length === 0) {
      return;
    }
    const target = edge === 'start' ? enabled[0] : enabled[enabled.length - 1];
    this.activateByFocus(target);
  }

  /** Automatic activation: moving focus also selects the tab. */
  private activateByFocus(tab: Tab): void {
    this.#focusedId.set(tab.id);
    this.selectTab(tab);
    this.focusTab(tab.id);
  }

  private focusTab(id: string): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-tabs, synergos-tabs');
      const root = host?.shadowRoot ?? document;
      const button = (root as ParentNode).querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
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
