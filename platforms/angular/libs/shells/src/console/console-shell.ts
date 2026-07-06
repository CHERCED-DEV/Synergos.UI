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
  readonly emptyMessage?: string;
  readonly loadingMessage?: string;
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
  imports: [NgTemplateOutlet],
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

              @if (loading()) {
                <p class="syn-console__empty" role="status">
                  {{ config().loadingMessage || 'Cargando…' }}
                </p>
              } @else if (rows().length === 0) {
                <p class="syn-console__empty">
                  {{ config().emptyMessage || 'No hay elementos en esta cola.' }}
                </p>
              } @else {
                <div class="syn-console__table-wrap">
                  <table class="syn-console__table" [attr.aria-label]="section.label">
                    <thead>
                      <tr>
                        @for (column of columns(); track column.key) {
                          <th
                            class="syn-console__th"
                            [class.is-end]="column.align === 'end'"
                            scope="col"
                          >
                            {{ column.label }}
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
                      @for (row of rows(); track $index; let index = $index) {
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
  /** How to render one table cell; switch on `column.key` inside. */
  readonly cellTemplate = input.required<TemplateRef<ConsoleCellContext<TRow>>>();
  /** Content for every non-table section; switch on `$implicit.id` inside. */
  readonly sectionTemplate = input<TemplateRef<ConsoleSectionContext> | null>(null);
  /** Reports slot rendered under the KPI band (`$implicit` = active section id). */
  readonly reportsTemplate = input<TemplateRef<ConsoleReportsContext> | null>(null);
  /** Optional controlled active section id. */
  readonly section = input<string | undefined>(undefined);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly sectionchange = output<string>();
  readonly filterchange = output<string>();
  readonly rowaction = output<ConsoleRowActionEvent<TRow>>();

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly activeSectionId = linkedSignal(
    () => this.section() ?? this.config().sections[0]?.id ?? '',
  );

  readonly activeSection = computed(
    () => this.config().sections.find((entry) => entry.id === this.activeSectionId()) ?? null,
  );

  /** Active filter resets to the first chip whenever the chips change. */
  readonly activeFilterKey = linkedSignal(() => this.filters()[0]?.key ?? '');

  readonly hasActions = computed(() => {
    if (this.actionsFor() !== null) {
      return true;
    }
    return this.actions().length > 0;
  });

  // ─── Actions ───────────────────────────────────────────────────────────────
  isTable(section: ConsoleSection): boolean {
    return (section.kind ?? 'table') === 'table';
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
