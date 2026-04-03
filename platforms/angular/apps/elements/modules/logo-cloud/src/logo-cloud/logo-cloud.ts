import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { LogoCloudElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  GridColumnsComponent,
  HeadingComponent,
  LinkComponent,
  type HeadingTone,
  coerceConfigInput,
  coerceOptionalNumberInput,
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

function normalizeItem(value: unknown): LogoCloudItem | null {
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
    transform: coerceConfigInput<LogoCloudElementConfig>,
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
    resolveConfigValue(this.columnsInput(), undefined, 4),
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

    const configItems = this.config()?.items;
    if (Array.isArray(configItems)) {
      return (configItems as unknown[])
        .map((item) => normalizeItem(item))
        .filter((item): item is LogoCloudItem => item !== null);
    }

    return [];
  });
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly resolvedColumns = computed(() => {
    const columns = this.columns();
    return columns > 0 ? columns : 4;
  });
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(
    () => `logo-cloud--${this.variant()} logo-cloud--${this.theme()}`,
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
