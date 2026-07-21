import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { TabGroupElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  HeadingComponent,
  TabsComponent,
  type HeadingTone,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynTabGroup</c>.
 *
 * An accessible tab set: a horizontal tablist whose panels swap in place.
 * The accessible primitive lives in the shared `syn-tabs` composition
 * (roles `tablist`/`tab`/`tabpanel`, `aria-selected`, roving `tabindex`,
 * Arrow/Home/End navigation, Enter/Space activation via native buttons).
 * This element owns the active-tab state, surfaces a `tabchange`
 * CustomEvent, and applies the variant/theme chrome.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface TabGroupTabItem {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled?: boolean;
}

/** Emitted on the `tabchange` CustomEvent and the typed Angular output. */
export interface TabGroupChangeDetail {
  readonly activeId: string;
  readonly index: number;
  readonly label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeTab(value: unknown): TabGroupTabItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value['id']).trim();
  const label = readString(value['label']).trim();
  const content = readString(value['content']).trim();
  if (!id || !label) {
    return null;
  }

  return {
    id,
    label,
    content,
    disabled: value['disabled'] === true,
  };
}

export function normalizeTabs(value: unknown): readonly TabGroupTabItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((tab) => normalizeTab(tab))
    .filter((tab): tab is TabGroupTabItem => tab !== null);
}

export function sanitizeTabGroupConfig(
  value: Partial<TabGroupElementConfig>,
): Partial<TabGroupElementConfig> {
  return omitUndefinedProperties<Partial<TabGroupElementConfig>>({
    title: coerceTrimmedStringInput(value.title),
    activeId: coerceTrimmedStringInput(value.activeId),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
    tabs: normalizeTabs(value.tabs),
  });
}

@Component({
  selector: 'sg-tab-group',
  standalone: true,
  imports: [HeadingComponent, TabsComponent],
  templateUrl: './tab-group.html',
  styleUrl: './tab-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tab-group' },
})
export class TabGroupElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<TabGroupElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<TabGroupElementConfig>>(sanitizeTabGroupConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly tabsInput = input<string | undefined>(undefined, { alias: 'tabs' });
  readonly activeIdInput = input<string | undefined>(undefined, { alias: 'activeId' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  /** Typed Angular output mirroring the native `tabchange` CustomEvent. */
  readonly tabchange = output<TabGroupChangeDetail>();

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, 'Tabs'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly parsedTabs = computed<readonly TabGroupTabItem[]>(() => {
    if (this.tabsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.tabsInput());
      return normalizeTabs(parsedValue);
    }

    if (this.config()) {
      return normalizeTabs(this.config()?.tabs);
    }

    return [];
  });

  /** Configured initial active id; falls back to the first enabled tab. */
  readonly configuredActiveId = computed(() =>
    resolveConfigValue(this.activeIdInput(), this.config()?.activeId, ''),
  );

  /** Locally selected id; empty until the visitor (or method) picks one. */
  readonly #selectedId = signal('');

  /** Resolved active tab id: local selection → configured → first enabled. */
  readonly activeId = computed(() => {
    const tabs = this.parsedTabs();
    const selected = this.#selectedId();
    if (selected && tabs.some((tab) => tab.id === selected && !tab.disabled)) {
      return selected;
    }

    const configured = this.configuredActiveId();
    if (configured && tabs.some((tab) => tab.id === configured && !tab.disabled)) {
      return configured;
    }

    return tabs.find((tab) => !tab.disabled)?.id ?? '';
  });

  readonly activeIndex = computed(() =>
    this.parsedTabs().findIndex((tab) => tab.id === this.activeId()),
  );

  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hasTitle = computed(() => this.title().trim().length > 0);
  readonly hasTabs = computed(() => this.parsedTabs().length > 0);
  readonly hostClasses = computed(
    () =>
      `tab-group--${this.variant()} tab-group--${this.theme()} ` +
      `sg-tab-group--${this.variant()} sg-tab-group--${this.theme()}`,
  );

  /**
   * Programmatic / wired activation. Bridges the shared `syn-tabs`
   * `activeIdChange` output into the element's own `tabchange` CustomEvent.
   */
  selectTab(id: string): void {
    const tabs = this.parsedTabs();
    const index = tabs.findIndex((tab) => tab.id === id);
    const tab = tabs[index];
    if (!tab || tab.disabled || id === this.activeId()) {
      return;
    }

    this.#selectedId.set(id);
    this.tabchange.emit({ activeId: id, index, label: tab.label });
  }
}
