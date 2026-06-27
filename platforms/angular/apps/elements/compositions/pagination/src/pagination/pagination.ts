import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynPagination</c>.
 *
 * A page navigator: numbered pages with prev/next controls and ellipsis
 * truncation for long ranges. Derives the page count from `totalItems` /
 * `itemsPerPage` (or accepts an explicit `totalPages`). Selecting a page
 * emits a `pagechange` CustomEvent carrying the page number and its href.
 *
 * When `urlTemplate` is supplied (e.g. `/blog?page={page}`) each page is a
 * real anchor for crawlable, no-JS pagination; otherwise pages are buttons
 * driving the typed `pagechange` output for client-side navigation.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface PaginationRuntimeConfig {
  readonly totalItems?: number;
  readonly itemsPerPage?: number;
  readonly totalPages?: number;
  readonly currentPage?: number;
  readonly siblingCount?: number;
  readonly boundaryCount?: number;
  readonly urlTemplate?: string;
  readonly label?: string;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
}

/** Emitted on the `pagechange` CustomEvent and the typed Angular output. */
export interface PaginationChangeDetail {
  readonly page: number;
  readonly totalPages: number;
  readonly href: string;
}

/** A rendered slot: either a navigable page or an ellipsis gap. */
export interface PaginationItem {
  readonly kind: 'page' | 'ellipsis';
  readonly page: number;
  readonly href: string;
  readonly isCurrent: boolean;
  /** Stable key for the @for track (ellipsis gaps share no page number). */
  readonly id: string;
}

const PAGE_TOKEN = /\{page\}/g;
const DEFAULT_ITEMS_PER_PAGE = 10;
const DEFAULT_SIBLING_COUNT = 1;
const DEFAULT_BOUNDARY_COUNT = 1;
const DEFAULT_LABEL = 'Paginación';
const DEFAULT_PREVIOUS_LABEL = 'Anterior';
const DEFAULT_NEXT_LABEL = 'Siguiente';

/** Clamp a value into [min, max], coercing NaN to the minimum. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** Coerce arbitrary input to a finite positive integer, or 0 when invalid. */
export function toPositiveInt(value: unknown): number {
  const numeric = coerceOptionalNumberInput(value);
  if (numeric === undefined || !Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

/** Derive the total page count from items/pageSize or an explicit count. */
export function resolveTotalPages(
  totalItems: number,
  itemsPerPage: number,
  explicitTotalPages: number,
): number {
  if (explicitTotalPages > 0) {
    return explicitTotalPages;
  }
  const size = itemsPerPage > 0 ? itemsPerPage : DEFAULT_ITEMS_PER_PAGE;
  if (totalItems <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(totalItems / size));
}

/**
 * Build the numbered range with ellipsis gaps (Material/MUI-style).
 *
 * Always shows `boundaryCount` pages at each edge and `siblingCount` pages
 * either side of the current page; collapses the remaining runs into a
 * single ellipsis when they span more than one hidden page.
 */
export function buildPageRange(
  current: number,
  totalPages: number,
  siblingCount: number,
  boundaryCount: number,
): readonly (number | 'ellipsis')[] {
  if (totalPages <= 0) {
    return [];
  }

  const boundaries = Math.max(0, boundaryCount);
  const siblings = Math.max(0, siblingCount);

  const startPages = range(1, Math.min(boundaries, totalPages));
  const endPages = range(Math.max(totalPages - boundaries + 1, boundaries + 1), totalPages);

  const siblingsStart = Math.max(
    Math.min(current - siblings, totalPages - boundaries - siblings * 2 - 1),
    boundaries + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(current + siblings, boundaries + siblings * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : totalPages - 1,
  );

  const items: (number | 'ellipsis')[] = [...startPages];

  if (siblingsStart > boundaries + 2) {
    items.push('ellipsis');
  } else if (boundaries + 1 < totalPages - boundaries) {
    items.push(boundaries + 1);
  }

  items.push(...range(siblingsStart, siblingsEnd));

  if (siblingsEnd < totalPages - boundaries - 1) {
    items.push('ellipsis');
  } else if (totalPages - boundaries > boundaries) {
    items.push(totalPages - boundaries);
  }

  items.push(...endPages);

  // De-duplicate while preserving order (edge cases with tiny page counts).
  const seen = new Set<number>();
  const result: (number | 'ellipsis')[] = [];
  for (const entry of items) {
    if (entry === 'ellipsis') {
      if (result[result.length - 1] !== 'ellipsis') {
        result.push(entry);
      }
      continue;
    }
    if (entry < 1 || entry > totalPages || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function range(start: number, end: number): number[] {
  if (end < start) {
    return [];
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function sanitizePaginationConfig(
  value: Partial<PaginationRuntimeConfig>,
): PaginationRuntimeConfig {
  return omitUndefinedProperties<PaginationRuntimeConfig>({
    totalItems: coerceOptionalNumberInput(value.totalItems),
    itemsPerPage: coerceOptionalNumberInput(value.itemsPerPage),
    totalPages: coerceOptionalNumberInput(value.totalPages),
    currentPage: coerceOptionalNumberInput(value.currentPage),
    siblingCount: coerceOptionalNumberInput(value.siblingCount),
    boundaryCount: coerceOptionalNumberInput(value.boundaryCount),
    urlTemplate: coerceTrimmedStringInput(value.urlTemplate),
    label: coerceTrimmedStringInput(value.label),
    previousLabel: coerceTrimmedStringInput(value.previousLabel),
    nextLabel: coerceTrimmedStringInput(value.nextLabel),
  });
}

@Component({
  selector: 'sg-pagination',
  standalone: true,
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-pagination' },
})
export class PaginationElementComponent {
  readonly config = input<PaginationRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<PaginationRuntimeConfig>(sanitizePaginationConfig),
  });
  readonly totalItemsInput = input<string | number | undefined>(undefined, { alias: 'totalItems' });
  readonly itemsPerPageInput = input<string | number | undefined>(undefined, {
    alias: 'itemsPerPage',
  });
  readonly totalPagesInput = input<string | number | undefined>(undefined, { alias: 'totalPages' });
  readonly currentPageInput = input<string | number | undefined>(undefined, { alias: 'currentPage' });
  readonly siblingCountInput = input<string | number | undefined>(undefined, {
    alias: 'siblingCount',
  });
  readonly boundaryCountInput = input<string | number | undefined>(undefined, {
    alias: 'boundaryCount',
  });
  readonly urlTemplateInput = input<string | undefined>(undefined, { alias: 'urlTemplate' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly previousLabelInput = input<string | undefined>(undefined, { alias: 'previousLabel' });
  readonly nextLabelInput = input<string | undefined>(undefined, { alias: 'nextLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `pagechange` CustomEvent. */
  readonly pagechange = output<PaginationChangeDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, DEFAULT_LABEL),
  );
  readonly previousLabel = computed(() =>
    resolveConfigValue(this.previousLabelInput(), this.config()?.previousLabel, DEFAULT_PREVIOUS_LABEL),
  );
  readonly nextLabel = computed(() =>
    resolveConfigValue(this.nextLabelInput(), this.config()?.nextLabel, DEFAULT_NEXT_LABEL),
  );

  readonly urlTemplate = computed(() =>
    resolveConfigValue(this.urlTemplateInput(), this.config()?.urlTemplate, ''),
  );

  readonly #totalItems = computed(() =>
    toPositiveInt(resolveConfigValue(this.totalItemsInput(), this.config()?.totalItems, 0)),
  );
  readonly #itemsPerPage = computed(() =>
    toPositiveInt(resolveConfigValue(this.itemsPerPageInput(), this.config()?.itemsPerPage, 0)),
  );
  readonly #explicitTotalPages = computed(() =>
    toPositiveInt(resolveConfigValue(this.totalPagesInput(), this.config()?.totalPages, 0)),
  );

  readonly siblingCount = computed(() => {
    const resolved = coerceOptionalNumberInput(
      resolveConfigValue(this.siblingCountInput(), this.config()?.siblingCount, DEFAULT_SIBLING_COUNT),
    );
    return resolved !== undefined && resolved >= 0 ? Math.floor(resolved) : DEFAULT_SIBLING_COUNT;
  });
  readonly boundaryCount = computed(() => {
    const resolved = coerceOptionalNumberInput(
      resolveConfigValue(this.boundaryCountInput(), this.config()?.boundaryCount, DEFAULT_BOUNDARY_COUNT),
    );
    return resolved !== undefined && resolved >= 1 ? Math.floor(resolved) : DEFAULT_BOUNDARY_COUNT;
  });

  /** Total page count derived from items/pageSize or an explicit override. */
  readonly totalPages = computed(() =>
    resolveTotalPages(this.#totalItems(), this.#itemsPerPage(), this.#explicitTotalPages()),
  );

  /** Active page, clamped into [1, totalPages]; user clicks update this. */
  readonly #activePage = signal<number>(1);
  readonly currentPage = computed(() => {
    const total = this.totalPages();
    if (total <= 0) {
      return 0;
    }
    return clamp(this.#activePage(), 1, total);
  });

  readonly hasPages = computed(() => this.totalPages() > 0);
  readonly isFirst = computed(() => this.currentPage() <= 1);
  readonly isLast = computed(() => this.currentPage() >= this.totalPages());

  readonly previousHref = computed(() => this.hrefFor(this.currentPage() - 1));
  readonly nextHref = computed(() => this.hrefFor(this.currentPage() + 1));

  /** The rendered slots (numbered pages + ellipsis gaps). */
  readonly items = computed<readonly PaginationItem[]>(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const range = buildPageRange(current, total, this.siblingCount(), this.boundaryCount());

    let ellipsisCount = 0;
    return range.map((entry): PaginationItem => {
      if (entry === 'ellipsis') {
        ellipsisCount += 1;
        return {
          kind: 'ellipsis',
          page: 0,
          href: '',
          isCurrent: false,
          id: `ellipsis-${ellipsisCount}`,
        };
      }
      return {
        kind: 'page',
        page: entry,
        href: this.hrefFor(entry),
        isCurrent: entry === current,
        id: `page-${entry}`,
      };
    });
  });

  constructor() {
    // Sync the active page whenever the configured currentPage changes.
    effect(() => {
      const configured = toPositiveInt(
        resolveConfigValue(this.currentPageInput(), this.config()?.currentPage, 0),
      );
      if (configured > 0) {
        this.#activePage.set(configured);
      }
    });
  }

  /** Render an href for a page, or '' when no template / out of range. */
  hrefFor(page: number): string {
    const template = this.urlTemplate();
    if (!template || page < 1 || page > this.totalPages()) {
      return '';
    }
    return template.replace(PAGE_TOKEN, String(page));
  }

  goToPage(page: number): void {
    const total = this.totalPages();
    if (total <= 0) {
      return;
    }
    const target = clamp(page, 1, total);
    if (target === this.currentPage()) {
      return;
    }
    this.#activePage.set(target);
    this.pagechange.emit({
      page: target,
      totalPages: total,
      href: this.hrefFor(target),
    });
  }

  previous(): void {
    if (!this.isFirst()) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  next(): void {
    if (!this.isLast()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  /** Activate a page from a click; suppress default nav when no template. */
  onPageActivate(event: Event, page: number): void {
    if (!this.urlTemplate()) {
      event.preventDefault();
    }
    this.goToPage(page);
  }

  onPreviousActivate(event: Event): void {
    if (!this.urlTemplate() || this.isFirst()) {
      event.preventDefault();
    }
    this.previous();
  }

  onNextActivate(event: Event): void {
    if (!this.urlTemplate() || this.isLast()) {
      event.preventDefault();
    }
    this.next();
  }
}
