import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  HeadingComponent,
  TabsComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

interface TabGroupTabItem {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled?: boolean;
}

export interface TabGroupConfig {
  readonly title?: string;
  readonly tabs?: readonly TabGroupTabItem[];
  readonly activeId?: string;
  readonly ariaLabel?: string;
  readonly variant?: string;
  readonly theme?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeTab(value: unknown): TabGroupTabItem | null {
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

  readonly configInput = input<Partial<TabGroupConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<TabGroupConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly tabsInput = input<string | undefined>(undefined, { alias: 'tabs' });
  readonly activeIdInput = input<string | undefined>(undefined, { alias: 'activeId' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly activeId = computed(() =>
    resolveConfigValue(this.activeIdInput(), this.configInput()?.activeId, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, 'Tabs'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );
  readonly parsedTabs = computed<readonly TabGroupTabItem[]>(() => {
    if (this.tabsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.tabsInput());
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((tab) => normalizeTab(tab))
        .filter((tab): tab is TabGroupTabItem => tab !== null);
    }

    return this.configInput()?.tabs ?? [];
  });
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(() => `tab-group--${this.variant()} tab-group--${this.theme()}`);
}
