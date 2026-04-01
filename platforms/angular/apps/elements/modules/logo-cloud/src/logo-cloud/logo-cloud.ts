import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  GridColumnsComponent,
  HeadingComponent,
  LinkComponent,
  type HeadingTone,
  coerceConfigInput,
  coerceOptionalNumberInput,
  resolveConfigValue,
} from '@synergos/shared';

interface LogoCloudItem {
  readonly src: string;
  readonly alt?: string;
  readonly label?: string;
  readonly href?: string;
  readonly target?: string;
}

export interface LogoCloudConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly items?: readonly LogoCloudItem[];
  readonly columns?: number;
  readonly variant?: string;
  readonly theme?: string;
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
  standalone: true,
  imports: [GridColumnsComponent, HeadingComponent, LinkComponent],
  templateUrl: './logo-cloud.html',
  styleUrl: './logo-cloud.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-logo-cloud' },
})
export class LogoCloudElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly configInput = input<Partial<LogoCloudConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<LogoCloudConfig>,
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
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly columns = computed(() =>
    resolveConfigValue(this.columnsInput(), this.configInput()?.columns, 4),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
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

    return (this.configInput()?.items ?? [])
      .map((item) => normalizeItem(item))
      .filter((item): item is LogoCloudItem => item !== null);
  });
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly resolvedColumns = computed(() => {
    const columns = this.columns();
    return columns > 0 ? columns : 4;
  });
  readonly hostClasses = computed(
    () => `logo-cloud--${this.variant()} logo-cloud--${this.theme()}`,
  );

  trackItem(item: LogoCloudItem, index: number): string {
    return `${item.src}-${index}`;
  }
}
