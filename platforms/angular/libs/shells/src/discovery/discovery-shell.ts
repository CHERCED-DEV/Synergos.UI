import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SynSkeletonComponent, type SkeletonVariant } from '../states/skeleton';
import { SynEmptyStateComponent, type EmptyStateKind } from '../states/empty-state';
import { SynErrorStateComponent } from '../states/error-state';
import { SynStatusBannerComponent } from '../states/status-banner';

/**
 * SH-1 — `syn-discovery-shell` (catálogo §1.3 doc 21).
 *
 * The reusable P1 organism: search-box + faceted filter-board (facet counts fed
 * by input) + templated result grid/list + sort + pagination. **Domain-free by
 * contract (OCP):** the shell never knows "producto/hotel/curso" — the consumer
 * feeds `items`/`facets`/`total` from its own `I*SearchProvider` and reacts to
 * `criteriachange` by re-querying. Rendering of each result is delegated to
 * `itemTemplate`; selection is delegated back through the template context's
 * `select()` so the consumer decides which element is the trigger (a11y-clean,
 * no nested interactive wrappers).
 */

/** One selectable value inside a facet group, with an optional result count. */
export interface DiscoveryFacetValue {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

/** A facet group (category / brand / condition / …). */
export interface DiscoveryFacet {
  readonly key: string;
  readonly label: string;
  readonly values: readonly DiscoveryFacetValue[];
}

/** One sort option for the toolbar. */
export interface DiscoverySortOption {
  readonly key: string;
  readonly label: string;
}

/** The active search criteria the shell reports on every change. */
export interface DiscoveryCriteria {
  readonly term: string;
  readonly facets: Readonly<Record<string, readonly string[]>>;
  readonly sort: string;
  readonly page: number;
}

/** Copy + behaviour config. Everything optional — sane neutral defaults. */
export interface DiscoveryShellConfig {
  readonly searchLabel?: string;
  readonly searchPlaceholder?: string;
  readonly searchButtonLabel?: string;
  readonly showSearch?: boolean;
  readonly filtersHeading?: string;
  readonly clearLabel?: string;
  readonly sortLabel?: string;
  readonly emptyMessage?: string;
  readonly loadingMessage?: string;
  // ── State surfaces (Fase 2) — all optional, additive ─────────────────────────
  /** Title for the `no-results` empty surface. */
  readonly emptyTitle?: string;
  /** `first-use` empty surface (nothing exists yet) — onboarding copy + CTA. */
  readonly firstUseTitle?: string;
  readonly firstUseMessage?: string;
  readonly firstUseActionLabel?: string;
  readonly firstUseActionHref?: string;
  /** When set, the shell renders `syn-error-state` (with an inline retry). */
  readonly errorMessage?: string;
  readonly errorTitle?: string;
  /** Result-count nouns, e.g. `{ one: 'resultado', many: 'resultados' }`. */
  readonly resultsNoun?: { readonly one: string; readonly many: string };
  /** `grid` (default) or `list` layout for results. */
  readonly layout?: 'grid' | 'list';
  /** Page size used to derive the pagination. Default 12. */
  readonly pageSize?: number;
  readonly paginationLabel?: string;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
}

/** Template context for each rendered item. */
export interface DiscoveryItemContext<TItem> {
  readonly $implicit: TItem;
  readonly index: number;
  /** Call to report this item as selected (emits `itemselect`). */
  readonly select: () => void;
}

let discoveryInstanceId = 0;

@Component({
  selector: 'syn-discovery-shell',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    SynSkeletonComponent,
    SynEmptyStateComponent,
    SynErrorStateComponent,
    SynStatusBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-discovery-shell' },
  styleUrl: './discovery-shell.scss',
  template: `
    <div class="syn-discovery" [class.syn-discovery--list]="layout() === 'list'">
      @if (degradedMessage(); as degraded) {
        <syn-status-banner class="syn-discovery__banner" [message]="degraded" />
      }
      @if (showSearch()) {
        <form class="syn-discovery__search" role="search" (submit)="onSearchSubmit($event)">
          <label class="syn-discovery__sr-only" [attr.for]="fieldId + '-q'">
            {{ config().searchLabel || 'Buscar' }}
          </label>
          <input
            class="syn-discovery__search-input"
            type="search"
            [id]="fieldId + '-q'"
            [placeholder]="config().searchPlaceholder || ''"
            [value]="term()"
            (input)="onTermInput($event)"
          />
          <button class="syn-discovery__search-btn" type="submit">
            {{ config().searchButtonLabel || 'Buscar' }}
          </button>
        </form>
      }

      <div class="syn-discovery__body">
        @if (facets().length > 0) {
          <aside class="syn-discovery__facets" [attr.aria-label]="config().filtersHeading || 'Filtros'">
            <div class="syn-discovery__facets-head">
              <h2 class="syn-discovery__facets-title">{{ config().filtersHeading || 'Filtros' }}</h2>
              @if (hasActiveCriteria()) {
                <button type="button" class="syn-discovery__clear" (click)="clear()">
                  {{ config().clearLabel || 'Limpiar' }}
                </button>
              }
            </div>
            @for (facet of facets(); track facet.key) {
              <fieldset class="syn-discovery__facet">
                <legend class="syn-discovery__facet-legend">{{ facet.label }}</legend>
                @for (value of facet.values; track value.value) {
                  <label class="syn-discovery__facet-option">
                    <input
                      type="checkbox"
                      [checked]="isSelected(facet.key, value.value)"
                      (change)="toggleFacet(facet.key, value.value)"
                    />
                    <span class="syn-discovery__facet-label">{{ value.label }}</span>
                    @if (value.count !== undefined) {
                      <span class="syn-discovery__facet-count">{{ value.count }}</span>
                    }
                  </label>
                }
              </fieldset>
            }
          </aside>
        }

        <div class="syn-discovery__results">
          <div class="syn-discovery__toolbar">
            <p class="syn-discovery__count" aria-live="polite">
              {{ totalCount() }}
              {{ totalCount() === 1 ? (config().resultsNoun?.one || 'resultado') : (config().resultsNoun?.many || 'resultados') }}
            </p>
            @if (sortOptions().length > 0) {
              <label class="syn-discovery__sort">
                <span class="syn-discovery__sort-label">{{ config().sortLabel || 'Ordenar por' }}</span>
                <select class="syn-discovery__select" [value]="sort()" (change)="onSortChange($event)">
                  @for (option of sortOptions(); track option.key) {
                    <option [value]="option.key">{{ option.label }}</option>
                  }
                </select>
              </label>
            }
          </div>

          @if (config().errorMessage; as errorMessage) {
            <syn-error-state
              class="syn-discovery__state"
              [title]="config().errorTitle || 'Algo salió mal'"
              [message]="errorMessage"
              (retry)="retry.emit()"
            />
          } @else if (loading()) {
            @if (loadingTemplate(); as tpl) {
              <ng-container [ngTemplateOutlet]="tpl" />
            } @else {
              <syn-skeleton
                class="syn-discovery__state"
                [variant]="skeletonVariant()"
                [rows]="skeletonRows()"
                [ariaLabel]="config().loadingMessage || 'Cargando…'"
              />
            }
          } @else if (items().length === 0) {
            <syn-empty-state
              class="syn-discovery__state"
              [kind]="emptyKind()"
              [title]="resolvedEmptyTitle()"
              [message]="resolvedEmptyMessage()"
              [actionLabel]="resolvedEmptyActionLabel()"
              [actionHref]="resolvedEmptyActionHref()"
              (action)="onEmptyAction()"
            />
          } @else {
            <ul class="syn-discovery__items" [class.syn-discovery__items--list]="layout() === 'list'">
              @for (item of items(); track $index) {
                <li class="syn-discovery__item">
                  <ng-container
                    [ngTemplateOutlet]="itemTemplate()"
                    [ngTemplateOutletContext]="itemContext(item, $index)"
                  />
                </li>
              }
            </ul>
          }

          @if (pageCount() > 1) {
            <nav class="syn-discovery__pagination" [attr.aria-label]="config().paginationLabel || 'Paginación'">
              <button
                type="button"
                class="syn-discovery__page-btn"
                [disabled]="page() <= 1"
                (click)="goToPage(page() - 1)"
              >
                {{ config().previousLabel || 'Anterior' }}
              </button>
              <span class="syn-discovery__page-info" aria-live="polite">
                {{ page() }} / {{ pageCount() }}
              </span>
              <button
                type="button"
                class="syn-discovery__page-btn"
                [disabled]="page() >= pageCount()"
                (click)="goToPage(page() + 1)"
              >
                {{ config().nextLabel || 'Siguiente' }}
              </button>
            </nav>
          }
        </div>
      </div>
    </div>
  `,
})
export class DiscoveryShellComponent<TItem> {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<DiscoveryShellConfig>({});
  readonly items = input<readonly TItem[]>([]);
  readonly facets = input<readonly DiscoveryFacet[]>([]);
  readonly sortOptions = input<readonly DiscoverySortOption[]>([]);
  /** Total result count (for pagination); defaults to `items().length`. */
  readonly total = input<number | null>(null);
  readonly loading = input(false);
  /** How to render one result. Context: `$implicit` item, `index`, `select()`. */
  readonly itemTemplate = input.required<TemplateRef<DiscoveryItemContext<TItem>>>();
  /** Optional custom loading surface; falls back to `syn-skeleton`. */
  readonly loadingTemplate = input<TemplateRef<unknown> | null>(null);
  /** When set, a persistent `syn-status-banner` ("datos de ejemplo") stacks on top. */
  readonly degradedMessage = input<string | undefined>(undefined);
  /** Optional deep-link seed; resets internal criteria whenever it changes. */
  readonly initialCriteria = input<Partial<DiscoveryCriteria> | undefined>(undefined);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly criteriachange = output<DiscoveryCriteria>();
  readonly itemselect = output<TItem>();
  /** Emitted when the inline error-state retry is pressed. */
  readonly retry = output<void>();
  /** Emitted when the `first-use` empty CTA (button) is pressed. */
  readonly emptyAction = output<void>();

  readonly fieldId = `syn-discovery-${(discoveryInstanceId += 1)}`;

  // ─── Criteria state (reseeded when initialCriteria changes) ────────────────
  readonly term = linkedSignal(() => this.initialCriteria()?.term ?? '');
  readonly selectedFacets = linkedSignal<Readonly<Record<string, readonly string[]>>>(
    () => this.initialCriteria()?.facets ?? {},
  );
  readonly sort = linkedSignal(
    () => this.initialCriteria()?.sort ?? this.sortOptions()[0]?.key ?? '',
  );
  readonly page = linkedSignal(() => this.initialCriteria()?.page ?? 1);

  // ─── Derived ───────────────────────────────────────────────────────────────
  readonly layout = computed(() => this.config().layout ?? 'grid');
  readonly totalCount = computed(() => this.total() ?? this.items().length);
  readonly pageSize = computed(() => Math.max(1, this.config().pageSize ?? 12));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
  readonly hasActiveCriteria = computed(() => {
    if (this.term().trim() !== '') {
      return true;
    }
    return Object.values(this.selectedFacets()).some((values) => values.length > 0);
  });

  /** The current criteria snapshot (what `criteriachange` emits). */
  readonly criteria = computed<DiscoveryCriteria>(() => ({
    term: this.term().trim(),
    facets: this.selectedFacets(),
    sort: this.sort(),
    page: this.page(),
  }));

  // ─── State surfaces (Fase 2) ────────────────────────────────────────────────
  /** `no-results` when criteria are active (filters/search); `first-use` otherwise. */
  readonly emptyKind = computed<EmptyStateKind>(() =>
    this.hasActiveCriteria() ? 'no-results' : 'first-use',
  );
  /** Skeleton mould matches the results layout (list → list, grid → cards). */
  readonly skeletonVariant = computed<SkeletonVariant>(() =>
    this.layout() === 'list' ? 'list' : 'card',
  );
  readonly skeletonRows = computed(() => Math.min(Math.max(this.pageSize(), 3), 8));

  /** Default no-results copy derived from context (nouns + echoed term). */
  private readonly derivedEmptyMessage = computed(() => {
    const noun = this.config().resultsNoun?.many ?? 'resultados';
    const term = this.term().trim();
    return term !== '' ? `No encontramos ${noun} para “${term}”.` : `No encontramos ${noun}.`;
  });

  readonly resolvedEmptyTitle = computed(() => {
    const cfg = this.config();
    return this.emptyKind() === 'first-use'
      ? (cfg.firstUseTitle ?? cfg.emptyTitle ?? 'Aún no hay nada aquí')
      : (cfg.emptyTitle ?? 'Sin resultados');
  });

  readonly resolvedEmptyMessage = computed(() => {
    const cfg = this.config();
    const base =
      this.emptyKind() === 'first-use' ? (cfg.firstUseMessage ?? cfg.emptyMessage) : cfg.emptyMessage;
    return base ?? this.derivedEmptyMessage();
  });

  readonly resolvedEmptyActionLabel = computed(() => {
    const cfg = this.config();
    return this.emptyKind() === 'no-results'
      ? (cfg.clearLabel ?? 'Limpiar filtros')
      : cfg.firstUseActionLabel;
  });

  readonly resolvedEmptyActionHref = computed(() =>
    this.emptyKind() === 'first-use' ? this.config().firstUseActionHref : undefined,
  );

  // ─── User actions (each one emits the fresh criteria) ─────────────────────
  onTermInput(event: Event): void {
    this.term.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.page.set(1);
    this.emitCriteria();
  }

  onSortChange(event: Event): void {
    const key = (event.target as HTMLSelectElement | null)?.value ?? '';
    if (key === this.sort()) {
      return;
    }
    this.sort.set(key);
    this.page.set(1);
    this.emitCriteria();
  }

  isSelected(facetKey: string, value: string): boolean {
    return (this.selectedFacets()[facetKey] ?? []).includes(value);
  }

  toggleFacet(facetKey: string, value: string): void {
    const current = this.selectedFacets();
    const selected = current[facetKey] ?? [];
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];
    const facets: Record<string, readonly string[]> = { ...current };
    if (next.length > 0) {
      facets[facetKey] = next;
    } else {
      delete facets[facetKey];
    }
    this.selectedFacets.set(facets);
    this.page.set(1);
    this.emitCriteria();
  }

  clear(): void {
    if (!this.hasActiveCriteria() && this.page() === 1) {
      return;
    }
    this.term.set('');
    this.selectedFacets.set({});
    this.page.set(1);
    this.emitCriteria();
  }

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), this.pageCount());
    if (clamped === this.page()) {
      return;
    }
    this.page.set(clamped);
    this.emitCriteria();
  }

  /** Empty CTA: clears criteria for `no-results`, else reports `first-use` intent. */
  onEmptyAction(): void {
    if (this.emptyKind() === 'no-results') {
      this.clear();
    } else {
      this.emptyAction.emit();
    }
  }

  showSearch(): boolean {
    return this.config().showSearch ?? true;
  }

  itemContext(item: TItem, index: number): DiscoveryItemContext<TItem> {
    return {
      $implicit: item,
      index,
      select: () => this.itemselect.emit(item),
    };
  }

  private emitCriteria(): void {
    this.criteriachange.emit(this.criteria());
  }
}
