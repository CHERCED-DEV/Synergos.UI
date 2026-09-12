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
import {
  SynSkeletonComponent,
  SynEmptyStateComponent,
  type EmptyStateKind,
  SynErrorStateComponent,
  SynStatusBannerComponent,
} from '@synergos/shared';

/**
 * SH-5 — `syn-console-shell` (catálogo §1.3 doc 21).
 *
 * The reusable P5 organism: the generic **cara B** (back-office) frame — a
 * section sidebar, a KPI dashboard band (cards with period delta), a built-in
 * data-table/queue per section (templated cells + chip filters + per-row
 * actions) and a reports slot. **Domain-free:** "seller central", "organizador",
 * "agente CRM", "instructor" and "officer queue" are all the same shell with
 * different config + templates. The shell never knows what an "orden" or a
 * "publicación" is — rows are opaque `TRow`s rendered through `cellTemplate`,
 * actions come from config (or `actionsFor` per row) and are reported back via
 * `rowaction` for the consumer to resolve against its own seams.
 */

/** One navigable section of the console. */
export interface ConsoleSection {
  readonly id: string;
  readonly label: string;
  /** Optional counter/badge rendered next to the label. */
  readonly badge?: string | number;
  /** `table` renders the built-in data-table/queue; `custom` uses `sectionTemplate`. */
  readonly kind?: 'table' | 'custom';
}

/** One KPI card of the dashboard band. */
export interface ConsoleKpi {
  readonly id: string;
  readonly label: string;
  /** Pre-formatted display value (the shell never formats domain numbers). */
  readonly value: string;
  /** Pre-formatted period delta chip (e.g. `+12%`). */
  readonly delta?: string;
  /** Styles the delta chip. Default `flat`. */
  readonly trend?: 'up' | 'down' | 'flat';
  /** Secondary line under the value (e.g. "vs. mes anterior"). */
  readonly hint?: string;
}

/** One column of the built-in data-table. */
export interface ConsoleColumn {
  readonly key: string;
  readonly label: string;
  readonly align?: 'start' | 'end';
  /**
   * Cómo se ordena esta columna, **declarado por el dominio**. Ausente = no se
   * ordena, que es el comportamiento que tenían las siete consolas.
   *
   * El shell NO lo adivina por el nombre de la clave: `'text'` y `'number'` se
   * comparan distinto y confundirlos ordena «10» antes que «9» sin fallar. Es la
   * misma doctrina de `DiscoveryFacet.kind` (#18).
   */
  readonly sortable?: 'text' | 'number' | 'date';
}

/** El orden activo de la tabla. */
export interface ConsoleSort {
  readonly key: string;
  readonly direction: 'asc' | 'desc';
}

/** One chip filter above the table. The consumer re-feeds `rows` on change. */
export interface ConsoleFilter {
  readonly key: string;
  readonly label: string;
}

/** One per-row action button. */
export interface ConsoleRowAction {
  readonly id: string;
  readonly label: string;
  /** Styles the button. Default `default`. */
  readonly kind?: 'default' | 'primary' | 'danger';
}

/** Copy + structure config. `sections` drives the whole shell. */
export interface ConsoleShellConfig {
  readonly heading?: string;
  readonly sections: readonly ConsoleSection[];
  readonly navLabel?: string;
  readonly kpisLabel?: string;
  readonly filtersLabel?: string;
  readonly actionsLabel?: string;
  /** Rótulo accesible del paginador. */
  readonly pagingLabel?: string;
  readonly emptyMessage?: string;
  readonly loadingMessage?: string;
  // ── State surfaces (Fase 2) — all optional, additive ─────────────────────────
  /** Title for the empty queue surface. */
  readonly emptyTitle?: string;
  /** CTA on the `first-use` empty queue (nothing exists yet). */
  readonly emptyActionLabel?: string;
  readonly emptyActionHref?: string;
  /** Label for the `no-results` "clear filter" CTA (a chip filter is active). */
  readonly clearFilterLabel?: string;
  /** When set, the queue renders `syn-error-state` (with an inline retry). */
  readonly errorMessage?: string;
  readonly errorTitle?: string;
}

/** Template context for one table cell. */
export interface ConsoleCellContext<TRow> {
  readonly $implicit: TRow;
  readonly column: ConsoleColumn;
  readonly index: number;
}

/** Template context for a custom section. */
export interface ConsoleSectionContext {
  readonly $implicit: ConsoleSection;
}

/** Template context for the reports slot (`$implicit` = active section id). */
export interface ConsoleReportsContext {
  readonly $implicit: string;
}

/** Emitted when a per-row action button is pressed. */
export interface ConsoleRowActionEvent<TRow> {
  readonly actionId: string;
  readonly row: TRow;
  readonly sectionId: string;
}

@Component({
  selector: 'syn-console-shell',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    SynSkeletonComponent,
    SynEmptyStateComponent,
    SynErrorStateComponent,
    SynStatusBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-console-shell' },
  styleUrl: './console-shell.scss',
  template: `
    <div class="syn-console">
      <nav class="syn-console__nav" [attr.aria-label]="config().navLabel || 'Secciones de la consola'">
        @if (config().heading) {
          <h1 class="syn-console__heading">{{ config().heading }}</h1>
        }
        @for (section of config().sections; track section.id) {
          <button
            type="button"
            class="syn-console__nav-btn"
            [class.is-active]="activeSectionId() === section.id"
            [attr.aria-current]="activeSectionId() === section.id ? 'page' : null"
            (click)="selectSection(section.id)"
          >
            {{ section.label }}
            @if (section.badge !== undefined && section.badge !== '') {
              <span class="syn-console__badge">{{ section.badge }}</span>
            }
          </button>
        }
      </nav>

      <div class="syn-console__main">
        @if (degradedMessage(); as degraded) {
          <syn-status-banner class="syn-console__banner" [message]="degraded" />
        }
        @if (kpis().length > 0) {
          <section class="syn-console__kpis" [attr.aria-label]="config().kpisLabel || 'Indicadores'">
            @for (kpi of kpis(); track kpi.id) {
              <article class="syn-console__kpi">
                <p class="syn-console__kpi-label">{{ kpi.label }}</p>
                <p class="syn-console__kpi-value">{{ kpi.value }}</p>
                <p class="syn-console__kpi-foot">
                  @if (kpi.delta) {
                    <span
                      class="syn-console__kpi-delta"
                      [class.is-up]="(kpi.trend ?? 'flat') === 'up'"
                      [class.is-down]="(kpi.trend ?? 'flat') === 'down'"
                    >
                      {{ kpi.delta }}
                    </span>
                  }
                  @if (kpi.hint) {
                    <span class="syn-console__kpi-hint">{{ kpi.hint }}</span>
                  }
                </p>
              </article>
            }
          </section>
        }

        @if (reportsTemplate(); as reports) {
          <div class="syn-console__reports">
            <ng-container
              [ngTemplateOutlet]="reports"
              [ngTemplateOutletContext]="{ $implicit: activeSectionId() }"
            />
          </div>
        }

        @if (activeSection(); as section) {
          @if (isTable(section)) {
            <section class="syn-console__queue" [attr.aria-label]="section.label">
              @if (filters().length > 0) {
                <div
                  class="syn-console__filters"
                  role="group"
                  [attr.aria-label]="config().filtersLabel || 'Filtros'"
                >
                  @for (filter of filters(); track filter.key) {
                    <button
                      type="button"
                      class="syn-console__filter"
                      [class.is-active]="activeFilterKey() === filter.key"
                      [attr.aria-pressed]="activeFilterKey() === filter.key"
                      (click)="selectFilter(filter.key)"
                    >
                      {{ filter.label }}
                    </button>
                  }
                </div>
              }

              @if (config().errorMessage; as errorMessage) {
                <syn-error-state
                  class="syn-console__state"
                  [title]="config().errorTitle || 'Algo salió mal'"
                  [message]="errorMessage"
                  (retry)="retry.emit()"
                />
              } @else if (loading()) {
                @if (loadingTemplate(); as tpl) {
                  <ng-container [ngTemplateOutlet]="tpl" />
                } @else {
                  <syn-skeleton
                    class="syn-console__state"
                    variant="table"
                    [rows]="6"
                    [columns]="skeletonColumns()"
                    [ariaLabel]="config().loadingMessage || 'Cargando…'"
                  />
                }
              } @else if (rows().length === 0) {
                <syn-empty-state
                  class="syn-console__state"
                  [kind]="emptyKind()"
                  [title]="resolvedEmptyTitle()"
                  [message]="resolvedEmptyMessage()"
                  [actionLabel]="resolvedEmptyActionLabel()"
                  [actionHref]="resolvedEmptyActionHref()"
                  (action)="onEmptyAction()"
                />
              } @else {
                <div class="syn-console__table-wrap">
                  <table class="syn-console__table" [attr.aria-label]="section.label">
                    <thead>
                      <tr>
                        @for (column of columns(); track column.key) {
                          <th
                            class="syn-console__th"
                            [class.is-end]="column.align === 'end'"
                            [class.is-sortable]="column.sortable"
                            scope="col"
                            [attr.aria-sort]="ariaSort(column)"
                          >
                            @if (column.sortable) {
                              <!-- Un botón y no un th clicable: tiene que alcanzarse con
                                   teclado y anunciarse como control. El aria-sort va en
                                   el th, que es donde la norma lo pide. -->
                              <button
                                type="button"
                                class="syn-console__sort"
                                (click)="toggleSort(column)"
                              >
                                {{ column.label }}
                                <span class="syn-console__sort-mark" aria-hidden="true">
                                  {{ sortMark(column) }}
                                </span>
                              </button>
                            } @else {
                              {{ column.label }}
                            }
                          </th>
                        }
                        @if (hasActions()) {
                          <th class="syn-console__th syn-console__th--actions" scope="col">
                            {{ config().actionsLabel || 'Acciones' }}
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of visibleRows(); track $index; let index = $index) {
                        <tr class="syn-console__tr">
                          @for (column of columns(); track column.key) {
                            <td class="syn-console__td" [class.is-end]="column.align === 'end'">
                              <ng-container
                                [ngTemplateOutlet]="cellTemplate()"
                                [ngTemplateOutletContext]="cellContext(row, column, index)"
                              />
                            </td>
                          }
                          @if (hasActions()) {
                            <td class="syn-console__td syn-console__td--actions">
                              @for (action of rowActions(row); track action.id) {
                                <button
                                  type="button"
                                  class="syn-console__action"
                                  [class.is-primary]="action.kind === 'primary'"
                                  [class.is-danger]="action.kind === 'danger'"
                                  (click)="triggerAction(action.id, row)"
                                >
                                  {{ action.label }}
                                </button>
                              }
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                @if (hasPaging()) {
                  <nav class="syn-console__paging" [attr.aria-label]="config().pagingLabel || 'Paginación'">
                    <button
                      type="button"
                      class="syn-console__page-btn"
                      [disabled]="activePage() <= 1"
                      (click)="goToPage(activePage() - 1)"
                    >
                      Anterior
                    </button>
                    <!-- Se dice el total, no sólo la página: en una cola de trabajo
                         «página 3 de 4» y «página 3 de 40» son dos días distintos. -->
                    <span class="syn-console__page-status" role="status">
                      Página {{ activePage() }} de {{ pageCount() }} · {{ rowCount() }}
                      {{ rowCount() === 1 ? 'caso' : 'casos' }}
                    </span>
                    <button
                      type="button"
                      class="syn-console__page-btn"
                      [disabled]="activePage() >= pageCount()"
                      (click)="goToPage(activePage() + 1)"
                    >
                      Siguiente
                    </button>
                  </nav>
                }
              }
            </section>
          } @else if (sectionTemplate(); as custom) {
            <div class="syn-console__section">
              <ng-container
                [ngTemplateOutlet]="custom"
                [ngTemplateOutletContext]="{ $implicit: section }"
              />
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ConsoleShellComponent<TRow> {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input.required<ConsoleShellConfig>();
  /** Dashboard KPI cards (pre-formatted values + deltas). */
  readonly kpis = input<readonly ConsoleKpi[]>([]);
  /** Rows of the active table section (the consumer swaps them per section). */
  readonly rows = input<readonly TRow[]>([]);
  /** Columns of the active table section. */
  readonly columns = input<readonly ConsoleColumn[]>([]);
  /** Chip filters above the table. The consumer re-feeds `rows` on `filterchange`. */
  readonly filters = input<readonly ConsoleFilter[]>([]);
  /** Row actions applied to every row (unless `actionsFor` overrides). */
  readonly actions = input<readonly ConsoleRowAction[]>([]);
  /** Optional per-row action resolver (e.g. status-dependent queues). */
  readonly actionsFor = input<((row: TRow) => readonly ConsoleRowAction[]) | null>(null);
  readonly loading = input(false);

  // ─── El sobre de lista (#21) ────────────────────────────────────────────────
  /**
   * El orden activo. `null` = el que traiga `defaultSort`, o ninguno.
   *
   * Se puede controlar desde el dominio (para deep-link, o para recordarlo entre
   * visitas) o dejar que el shell lo lleve solo.
   */
  readonly sort = input<ConsoleSort | null>(null);
  /** El orden inicial cuando el dominio no controla `sort`. */
  readonly defaultSort = input<ConsoleSort | null>(null);
  /**
   * **QUIÉN ordena.** `'client'` (defecto) ordena las filas que ya están aquí;
   * `'server'` sólo emite `sortchange` y espera filas nuevas.
   *
   * No es una opción de comodidad. Hoy las listas del profesional llegan
   * completas —ninguna pagina— así que ordenar aquí es correcto y resuelve el
   * problema. **El día que el backend pagine, ordenar aquí pasaría a ser un
   * defecto silencioso**: enseñaría «lo más urgente» de un subconjunto
   * arbitrario, con la cara de estar ordenado. Por eso lo declara quien lo usa y
   * el shell no lo supone.
   */
  readonly sortMode = input<'client' | 'server'>('client');
  /** Cuántas filas por página. `0` = sin paginar, que es como estaban. */
  readonly pageSize = input(0);
  /** La página activa, 1-based. */
  readonly page = input(1);
  /** `'client'` corta las filas que ya están; `'server'` espera que lleguen cortadas. */
  readonly pageMode = input<'client' | 'server'>('client');
  /** Total de filas que existen. Obligatorio con `pageMode: 'server'`. */
  readonly total = input<number | null>(null);
  /** How to render one table cell; switch on `column.key` inside. */
  readonly cellTemplate = input.required<TemplateRef<ConsoleCellContext<TRow>>>();
  /** Content for every non-table section; switch on `$implicit.id` inside. */
  readonly sectionTemplate = input<TemplateRef<ConsoleSectionContext> | null>(null);
  /** Reports slot rendered under the KPI band (`$implicit` = active section id). */
  readonly reportsTemplate = input<TemplateRef<ConsoleReportsContext> | null>(null);
  /** Optional controlled active section id. */
  readonly section = input<string | undefined>(undefined);
  /** Optional custom loading surface; falls back to `syn-skeleton` (table). */
  readonly loadingTemplate = input<TemplateRef<unknown> | null>(null);
  /** When set, a persistent `syn-status-banner` ("datos de ejemplo") stacks on top. */
  readonly degradedMessage = input<string | undefined>(undefined);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly sectionchange = output<string>();
  readonly filterchange = output<string>();
  /** El orden cambió. En modo `'server'` es la única señal que sale. */
  readonly sortchange = output<ConsoleSort>();
  /** La página cambió, 1-based. */
  readonly pagechange = output<number>();
  readonly rowaction = output<ConsoleRowActionEvent<TRow>>();
  /** Emitted when the inline error-state retry is pressed. */
  readonly retry = output<void>();
  /** Emitted when the `first-use` empty CTA (button) is pressed. */
  readonly emptyAction = output<void>();

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly activeSectionId = linkedSignal(
    () => this.section() ?? this.config().sections[0]?.id ?? '',
  );

  readonly activeSection = computed(
    () => this.config().sections.find((entry) => entry.id === this.activeSectionId()) ?? null,
  );

  /** Active filter resets to the first chip whenever the chips change. */
  readonly activeFilterKey = linkedSignal(() => this.filters()[0]?.key ?? '');

  // ─── El sobre de lista: orden y página (#21) ────────────────────────────────

  /** Orden que lleva el shell cuando el dominio no lo controla. */
  readonly #ownSort = linkedSignal<ConsoleSort | null>(() => this.defaultSort());

  /** El orden vigente: el del dominio si lo controla, si no el propio. */
  readonly activeSort = computed<ConsoleSort | null>(() => this.sort() ?? this.#ownSort());

  /** Página que lleva el shell. Vuelve a 1 cuando cambian filtro u orden. */
  readonly #ownPage = linkedSignal<number>(() => this.page());

  readonly activePage = computed(() => Math.max(1, this.#ownPage()));

  /** Las columnas que el dominio declaró ordenables. */
  /** La flecha del encabezado. Vacío cuando esta columna no es la activa. */
  sortMark(column: ConsoleColumn): string {
    const active = this.activeSort();
    if (!active || active.key !== column.key) {
      return '';
    }
    return active.direction === 'asc' ? '▲' : '▼';
  }

  sortableKind(column: ConsoleColumn): ConsoleColumn['sortable'] {
    return column.sortable;
  }

  /** `'ascending' | 'descending' | 'none'` para `aria-sort`. */
  ariaSort(column: ConsoleColumn): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) {
      return null;
    }
    const active = this.activeSort();
    if (!active || active.key !== column.key) {
      return 'none';
    }
    return active.direction === 'asc' ? 'ascending' : 'descending';
  }

  /**
   * Pulsar una cabecera ordenable.
   *
   * Primer clic: ascendente — para un plazo, «lo que vence primero» es lo que la
   * persona busca, y empezar por lo más lejano sería empezar por lo que no
   * importa. Segundo clic sobre la misma: invierte.
   */
  toggleSort(column: ConsoleColumn): void {
    if (!column.sortable) {
      return;
    }
    const active = this.activeSort();
    const direction: 'asc' | 'desc' =
      active && active.key === column.key && active.direction === 'asc' ? 'desc' : 'asc';
    const next: ConsoleSort = { key: column.key, direction };

    this.#ownSort.set(next);
    // Cambiar el orden vuelve a la primera página: quedarse en la 4 tras
    // reordenar enseña un tramo arbitrario del medio y parece un fallo de datos.
    this.#ownPage.set(1);
    this.sortchange.emit(next);
  }

  /**
   * Las filas tal como se pintan: ordenadas y cortadas **sólo si a este shell le
   * toca hacerlo**. En modo `'server'` se devuelven como llegaron.
   */
  readonly visibleRows = computed<readonly TRow[]>(() => {
    let list = this.rows();

    const active = this.activeSort();
    if (this.sortMode() === 'client' && active) {
      const column = this.columns().find((c) => c.key === active.key);
      if (column?.sortable) {
        list = [...list].sort((a, b) =>
          compararCeldas(
            leerCelda(a, active.key),
            leerCelda(b, active.key),
            column.sortable!,
            active.direction,
          ),
        );
      }
    }

    const size = this.pageSize();
    if (this.pageMode() === 'client' && size > 0) {
      const desde = (this.activePage() - 1) * size;
      list = list.slice(desde, desde + size);
    }
    return list;
  });

  /** Cuántas filas hay en total — las de aquí, o las que diga el servidor. */
  readonly rowCount = computed(() =>
    this.pageMode() === 'server' ? (this.total() ?? this.rows().length) : this.rows().length,
  );

  readonly pageCount = computed(() => {
    const size = this.pageSize();
    return size > 0 ? Math.max(1, Math.ceil(this.rowCount() / size)) : 1;
  });

  readonly hasPaging = computed(() => this.pageSize() > 0 && this.pageCount() > 1);

  goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.pageCount());
    if (next === this.activePage()) {
      return;
    }
    this.#ownPage.set(next);
    this.pagechange.emit(next);
  }

  readonly hasActions = computed(() => {
    if (this.actionsFor() !== null) {
      return true;
    }
    return this.actions().length > 0;
  });

  // ─── State surfaces (Fase 2) ────────────────────────────────────────────────
  /** A non-default chip filter is applied → the emptiness is a `no-results`. */
  readonly hasActiveFilter = computed(() => {
    const first = this.filters()[0]?.key ?? '';
    return this.filters().length > 0 && this.activeFilterKey() !== first;
  });
  readonly emptyKind = computed<EmptyStateKind>(() =>
    this.hasActiveFilter() ? 'no-results' : 'first-use',
  );
  /** Skeleton table columns mirror the real columns (+ the actions column). */
  readonly skeletonColumns = computed(() =>
    Math.max(1, this.columns().length + (this.hasActions() ? 1 : 0)),
  );

  readonly resolvedEmptyTitle = computed(() => {
    const cfg = this.config();
    return cfg.emptyTitle ?? (this.hasActiveFilter() ? 'Sin resultados' : 'Nada por aquí');
  });
  readonly resolvedEmptyMessage = computed(() => {
    const cfg = this.config();
    return (
      cfg.emptyMessage ??
      (this.hasActiveFilter()
        ? 'No hay elementos para este filtro.'
        : 'No hay elementos en esta cola.')
    );
  });
  readonly resolvedEmptyActionLabel = computed(() => {
    const cfg = this.config();
    return this.hasActiveFilter() ? (cfg.clearFilterLabel ?? 'Limpiar filtro') : cfg.emptyActionLabel;
  });
  readonly resolvedEmptyActionHref = computed(() =>
    this.hasActiveFilter() ? undefined : this.config().emptyActionHref,
  );

  // ─── Actions ───────────────────────────────────────────────────────────────
  isTable(section: ConsoleSection): boolean {
    return (section.kind ?? 'table') === 'table';
  }

  /** Empty CTA: resets to the first chip for `no-results`, else reports intent. */
  onEmptyAction(): void {
    if (this.hasActiveFilter()) {
      this.selectFilter(this.filters()[0]?.key ?? '');
    } else {
      this.emptyAction.emit();
    }
  }

  selectSection(id: string): void {
    if (id === this.activeSectionId()) {
      return;
    }
    this.activeSectionId.set(id);
    this.sectionchange.emit(id);
  }

  selectFilter(key: string): void {
    if (key === this.activeFilterKey()) {
      return;
    }
    this.activeFilterKey.set(key);
    this.filterchange.emit(key);
  }

  rowActions(row: TRow): readonly ConsoleRowAction[] {
    const resolver = this.actionsFor();
    return resolver ? resolver(row) : this.actions();
  }

  triggerAction(actionId: string, row: TRow): void {
    this.rowaction.emit({ actionId, row, sectionId: this.activeSectionId() });
  }

  cellContext(row: TRow, column: ConsoleColumn, index: number): ConsoleCellContext<TRow> {
    return { $implicit: row, column, index };
  }
}


/** Lee una celda por clave sin obligar al dominio a mapear nada. */
function leerCelda(row: unknown, key: string): unknown {
  return row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined;
}

/**
 * Compara dos celdas según el tipo que **declaró el dominio**.
 *
 * Los vacíos van SIEMPRE al final, en las dos direcciones. Es deliberado: en una
 * cola de trabajo, una fila sin plazo no es «la más urgente» ni «la menos» — es
 * una que no tiene el dato, y mandarla arriba al invertir el orden la haría
 * parecer lo contrario de lo que es.
 *
 * **Por eso la dirección entra AQUÍ y no se aplica por fuera.** La primera
 * versión multiplicaba el signo por el resultado entero, incluido el de los
 * vacíos, así que al invertir subían a lo más alto — exactamente lo que este
 * comentario decía que no podía pasar. Lo cazó su propio spec.
 */
function compararCeldas(
  a: unknown,
  b: unknown,
  kind: 'text' | 'number' | 'date',
  direction: 'asc' | 'desc',
): number {
  const vacioA = a === null || a === undefined || a === '';
  const vacioB = b === null || b === undefined || b === '';
  if (vacioA && vacioB) return 0;
  if (vacioA) return 1;
  if (vacioB) return -1;

  const signo = direction === 'asc' ? 1 : -1;

  if (kind === 'number') {
    const na = Number(a);
    const nb = Number(b);
    // NaN se trata como vacío: un número que no es número no puede ordenarse, y
    // dejarlo comparar devuelve `false` en todo y deja el orden al azar.
    if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return signo * (na - nb);
  }

  if (kind === 'date') {
    const da = Date.parse(String(a));
    const db = Date.parse(String(b));
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return signo * (da - db);
  }

  // `localeCompare` con `numeric` para que «Caso 10» vaya después de «Caso 9»,
  // que es lo que una persona espera de un radicado con número dentro.
  return signo * String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}
