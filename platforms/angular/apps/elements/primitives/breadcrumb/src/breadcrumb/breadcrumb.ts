import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
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
 * Runtime config for the CMS element <c>elementSynBreadcrumb</c>.
 *
 * Navigation breadcrumbs: an ordered trail of items, each optionally
 * linked, separated by a glyph, with the final item flagged as the
 * current page (`aria-current="page"`). Items can be authored as a JSON
 * array (objects with `label`/`href`, or bare strings). When
 * `includeStructuredData` is on the component also emits a
 * schema.org `BreadcrumbList` JSON-LD block for SEO.
 *
 * The shared `@synergos/contracts` package does not yet declare a
 * `BreadcrumbElementConfig`; the canonical shape lives here next to the
 * component until that contract lands in the registry ola.
 */
export interface BreadcrumbRuntimeConfig {
  readonly label?: string;
  readonly separator?: string;
  readonly includeStructuredData?: boolean;
  readonly items?: readonly BreadcrumbItemConfig[];
}

export interface BreadcrumbItemConfig {
  readonly label?: string;
  readonly href?: string;
}

/** Fully-resolved trail item ready to render. */
export interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly position: number;
  readonly isCurrent: boolean;
}

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

/**
 * Coerce arbitrary authored input into a clean breadcrumb trail. Strings
 * become label-only items; objects read `label`/`href`. Entries without a
 * usable label are dropped. The last surviving item is always the current
 * page (its href is cleared so it renders as plain text).
 */
export function normalizeItems(value: unknown): readonly BreadcrumbItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = value
    .map((entry): { label: string; href: string } | null => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { label, href: '' } : null;
      }

      if (isRecord(entry)) {
        const label = (readString(entry['label']).trim() || readString(entry['text']).trim());
        const href = (readString(entry['href']).trim() || readString(entry['url']).trim());
        return label ? { label, href } : null;
      }

      return null;
    })
    .filter((item): item is { label: string; href: string } => item !== null);

  const lastIndex = cleaned.length - 1;

  return cleaned.map((item, index): BreadcrumbItem => {
    const isCurrent = index === lastIndex;
    return {
      id: `crumb-${index}-${item.label}`,
      label: item.label,
      href: isCurrent ? '' : item.href,
      position: index + 1,
      isCurrent,
    };
  });
}

function sanitizeBreadcrumbConfig(
  value: Partial<BreadcrumbRuntimeConfig>,
): BreadcrumbRuntimeConfig {
  return omitUndefinedProperties<BreadcrumbRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    separator: coerceTrimmedStringInput(value.separator),
    includeStructuredData: coerceOptionalBooleanInput(value.includeStructuredData),
    items: value.items,
  });
}

@Component({
  selector: 'sg-breadcrumb',
  standalone: true,
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-breadcrumb' },
})
export class BreadcrumbElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<BreadcrumbRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BreadcrumbRuntimeConfig>(sanitizeBreadcrumbConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly separatorInput = input<string | undefined>(undefined, { alias: 'separator' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly includeStructuredDataInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'includeStructuredData',
    transform: coerceOptionalBooleanInput,
  });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Migas de pan'),
  );
  readonly separator = computed(() =>
    resolveConfigValue(this.separatorInput(), this.config()?.separator, '/'),
  );
  readonly includeStructuredData = computed(() =>
    resolveConfigValue(
      this.includeStructuredDataInput(),
      this.config()?.includeStructuredData,
      false,
    ),
  );

  readonly items = computed<readonly BreadcrumbItem[]>(() =>
    normalizeItems(this.resolveSource(this.itemsInput(), this.config()?.items)),
  );

  readonly hasItems = computed(() => this.items().length > 0);

  /** schema.org BreadcrumbList JSON-LD, emitted only when opted-in. */
  readonly structuredData = computed<string>(() => {
    if (!this.includeStructuredData() || !this.hasItems()) {
      return '';
    }

    const payload = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: this.items().map((item) => {
        const entry: Record<string, unknown> = {
          '@type': 'ListItem',
          position: item.position,
          name: item.label,
        };
        if (item.href) {
          entry['item'] = item.href;
        }
        return entry;
      }),
    };

    return JSON.stringify(payload);
  });

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }

    return configValue;
  }
}
