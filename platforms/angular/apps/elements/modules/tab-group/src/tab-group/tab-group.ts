import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
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

interface TabGroupTabItem {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled?: boolean;
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

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly activeId = computed(() =>
    resolveConfigValue(this.activeIdInput(), this.config()?.activeId, ''),
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
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () =>
      `tab-group--${this.variant()} tab-group--${this.theme()} ` +
      `sg-tab-group--${this.variant()} sg-tab-group--${this.theme()}`,
  );
}
