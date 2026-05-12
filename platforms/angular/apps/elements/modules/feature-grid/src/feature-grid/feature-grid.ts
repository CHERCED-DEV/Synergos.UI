import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { FeatureGridElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  GridColumnsComponent,
  HeadingComponent,
  type HeadingTone,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

interface FeatureGridItem {
  readonly body: string;
  readonly heading: string;
  readonly icon: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeFeatureGridItem(value: unknown): FeatureGridItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const heading = readString(value['headingText'] ?? value['heading']).trim();
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

export function normalizeFeatureGridItems(value: unknown): readonly FeatureGridItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeFeatureGridItem(item))
    .filter((item): item is FeatureGridItem => item !== null);

  return items.length > 0 ? items : undefined;
}

export function sanitizeFeatureGridConfig(
  value: Partial<FeatureGridElementConfig>,
): Partial<FeatureGridElementConfig> {
  return omitUndefinedProperties<Partial<FeatureGridElementConfig>>({
    headingText: coerceTrimmedStringInput(value.headingText),
    columns: coerceOptionalNumberInput(value.columns),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
    items: normalizeFeatureGridItems(value.items),
  });
}

@Component({
  selector: 'sg-feature-grid',
  imports: [GridColumnsComponent, HeadingComponent],
  templateUrl: './feature-grid.html',
  styleUrl: './feature-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-grid', '[style.display]': 'hasItems() ? null : "none"' },
})
export class FeatureGridComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<FeatureGridElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<FeatureGridElementConfig>>(sanitizeFeatureGridConfig),
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly columns = computed(() =>
    resolveConfigValue(this.columnsInput(), this.config()?.columns, 3),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );

  readonly parsedItems = computed<readonly FeatureGridItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.itemsInput());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeFeatureGridItem(item))
        .filter((item): item is FeatureGridItem => item !== null);
    }

    const configItems = normalizeFeatureGridItems(this.config()?.items);
    if (configItems) {
      return configItems;
    }

    return [];
  });
  readonly resolvedColumns = computed(() => (this.columns() > 0 ? this.columns() : 3));
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(() => `sg-feature-grid--${this.variant()} sg-feature-grid--${this.theme()}`);

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasItems() && (this.itemsInput() !== undefined || this.config() !== undefined)) {
          console.warn('[synergos-feature-grid] Items resolved to empty. Check your "items" attribute or "config.items" array format.');
        }
      });
    }
  }
}
