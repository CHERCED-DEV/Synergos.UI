import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  GridColumnsComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  coerceOptionalNumberInput,
  resolveConfigValue,
} from '@synergos/shared';

interface FeatureGridItem {
  readonly body: string;
  readonly heading: string;
  readonly icon: string;
}

export interface FeatureGridConfig {
  readonly headingText?: string;
  readonly columns?: number;
  readonly items?: readonly FeatureGridItem[];
  readonly theme?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFeatureGridItem(value: unknown): FeatureGridItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const heading = readString(value['heading']).trim();
  const body = readString(value['body']).trim();

  if (!heading && !body) {
    return null;
  }

  return {
    heading,
    body,
    icon: readString(value['icon']).trim(),
  };
}

@Component({
  selector: 'sg-feature-grid',
  imports: [GridColumnsComponent, HeadingComponent],
  templateUrl: './feature-grid.html',
  styleUrl: './feature-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-grid' },
})
export class FeatureGridComponent {
  readonly #initialData = inject(InitialDataService);

  readonly configInput = input<Partial<FeatureGridConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FeatureGridConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly columns = computed(() =>
    resolveConfigValue(this.columnsInput(), this.configInput()?.columns, 3),
  );
  readonly items = computed(() =>
    resolveConfigValue(this.itemsInput(), undefined, '[]'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly parsedItems = computed<readonly FeatureGridItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.items());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeFeatureGridItem(item))
        .filter((item): item is FeatureGridItem => item !== null);
    }

    return (this.configInput()?.items ?? [])
      .map((item) => normalizeFeatureGridItem(item))
      .filter((item): item is FeatureGridItem => item !== null);
  });
  readonly resolvedColumns = computed(() => (this.columns() > 0 ? this.columns() : 3));
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(() => `sg-feature-grid--${this.theme()}`);
}
