import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { LogoCloudElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  GridColumnsComponent,
  HeadingComponent,
  LinkComponent,
  type HeadingTone,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

interface LogoCloudItem {
  readonly src: string;
  readonly alt?: string;
  readonly label?: string;
  readonly href?: string;
  readonly target?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

export function normalizeItem(value: unknown): LogoCloudItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const src = readString(value['src']).trim();
  if (!src) {
    return null;
  }

  return {
    src,
    alt: readString(value['alt']).trim(),
    label: readString(value['label']).trim(),
    href: readString(value['href']).trim(),
    target: readString(value['target']).trim() || '_self',
  };
}

export function normalizeItems(value: unknown): readonly LogoCloudItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeItem(item))
    .filter((item): item is LogoCloudItem => item !== null);

  return items.length > 0 ? items : undefined;
}

export function sanitizeLogoCloudConfig(
  value: Partial<LogoCloudElementConfig>,
): Partial<LogoCloudElementConfig> {
  return omitUndefinedProperties<Partial<LogoCloudElementConfig>>({
    headingText: coerceTrimmedStringInput(value.headingText),
    body: coerceTrimmedStringInput(value.body),
    columns: coerceOptionalNumberInput(value.columns),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
    items: normalizeItems(value.items),
  });
}

@Component({
  selector: 'sg-logo-cloud',
  imports: [GridColumnsComponent, HeadingComponent, LinkComponent],
  templateUrl: './logo-cloud.html',
  styleUrl: './logo-cloud.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-logo-cloud', '[style.display]': 'hasItems() ? null : "none"' },
})
export class LogoCloudElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<LogoCloudElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<LogoCloudElementConfig>>(sanitizeLogoCloudConfig),
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly columnsInput = input<number | undefined, unknown>(undefined, {
    alias: 'columns',
    transform: coerceOptionalNumberInput,
  });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.config()?.body, ''),
  );
  readonly columns = computed(() =>
    resolveConfigValue(this.columnsInput(), readPositiveInteger(this.config()?.columns), 4),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly parsedItems = computed<readonly LogoCloudItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.itemsInput());
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeItem(item))
        .filter((item): item is LogoCloudItem => item !== null);
    }

    const configItems = normalizeItems(this.config()?.items);
    if (configItems) {
      return configItems;
    }

    return [];
  });
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly resolvedColumns = computed(() => {
    const columns = this.columns();
    if (!Number.isFinite(columns) || columns <= 0) {
      return 4;
    }

    return Math.min(12, Math.max(1, Math.floor(columns)));
  });
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(
    () =>
      `logo-cloud--${this.variant()} logo-cloud--${this.theme()} ` +
      `sg-logo-cloud--${this.variant()} sg-logo-cloud--${this.theme()}`,
  );

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasItems() && (this.itemsInput() !== undefined || this.config() !== undefined)) {
          console.warn('[synergos-logo-cloud] Items resolved to empty. Check your "items" attribute or "config.items" array format.');
        }
      });
    }
  }

  trackItem(item: LogoCloudItem, index: number): string {
    return `${item.src}-${index}`;
  }
}
