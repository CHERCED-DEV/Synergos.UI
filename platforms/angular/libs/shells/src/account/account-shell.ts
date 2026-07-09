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
  SynErrorStateComponent,
  SynStatusBannerComponent,
} from '@synergos/shared';

/**
 * SH-4 — `syn-account-shell` (catálogo §1.3 doc 21).
 *
 * The reusable P4 organism: a sectioned account area with a generic **"mis X"
 * inbox** (templated list + templated detail pane), plus any number of custom
 * sections (favoritos/listas, mensajes, perfil…) rendered through one
 * `sectionTemplate`. **Domain-free:** "mis compras", "mis viajes", "mi carpeta"
 * and "mis trámites" are all the same shell with different config + templates.
 * Pair it with `syn-tracking-timeline` inside the detail template for the
 * order/expediente state timeline.
 */

/** One navigable section of the account area. */
export interface AccountSection {
  readonly id: string;
  readonly label: string;
  /** Optional counter/badge rendered next to the label. */
  readonly badge?: string | number;
  /** `inbox` renders the built-in list+detail pane; `custom` uses `sectionTemplate`. */
  readonly kind?: 'inbox' | 'custom';
}

/** Copy + structure config. `sections` drives the whole shell. */
export interface AccountShellConfig {
  readonly heading?: string;
  readonly sections: readonly AccountSection[];
  readonly navLabel?: string;
  readonly inboxEmptyMessage?: string;
  readonly inboxLoadingMessage?: string;
  readonly detailPlaceholder?: string;
  // ── State surfaces (Fase 2) — all optional, additive ─────────────────────────
  /** Title + CTA for the `first-use` empty inbox ("aún no tienes X"). */
  readonly inboxEmptyTitle?: string;
  readonly inboxEmptyActionLabel?: string;
  readonly inboxEmptyActionHref?: string;
  /** When set, the inbox renders `syn-error-state` (with an inline retry). */
  readonly errorMessage?: string;
  readonly errorTitle?: string;
}

/** Template context for one inbox row. */
export interface AccountItemContext<TItem> {
  readonly $implicit: TItem;
  readonly index: number;
  readonly selected: boolean;
}

/** Template context for the detail pane. */
export interface AccountDetailContext<TItem> {
  readonly $implicit: TItem;
}

/** Template context for a custom section. */
export interface AccountSectionContext {
  readonly $implicit: AccountSection;
}

@Component({
  selector: 'syn-account-shell',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    SynSkeletonComponent,
    SynEmptyStateComponent,
    SynErrorStateComponent,
    SynStatusBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-account-shell' },
  styleUrl: './account-shell.scss',
  template: `
    <div class="syn-account">
      @if (config().heading) {
        <h1 class="syn-account__heading">{{ config().heading }}</h1>
      }

      @if (degradedMessage(); as degraded) {
        <syn-status-banner class="syn-account__banner" [message]="degraded" />
      }

      <nav class="syn-account__nav" [attr.aria-label]="config().navLabel || 'Secciones de la cuenta'">
        @for (section of config().sections; track section.id) {
          <button
            type="button"
            class="syn-account__nav-btn"
            [class.is-active]="activeSectionId() === section.id"
            [attr.aria-current]="activeSectionId() === section.id ? 'page' : null"
            (click)="selectSection(section.id)"
          >
            {{ section.label }}
            @if (section.badge !== undefined && section.badge !== '') {
              <span class="syn-account__badge">{{ section.badge }}</span>
            }
          </button>
        }
      </nav>

      @if (activeSection(); as section) {
        @if (isInbox(section)) {
          <div class="syn-account__inbox">
            <div class="syn-account__list-pane">
              @if (config().errorMessage; as errorMessage) {
                <syn-error-state
                  class="syn-account__state"
                  [title]="config().errorTitle || 'Algo salió mal'"
                  [message]="errorMessage"
                  (retry)="retry.emit()"
                />
              } @else if (loading()) {
                @if (loadingTemplate(); as tpl) {
                  <ng-container [ngTemplateOutlet]="tpl" />
                } @else {
                  <syn-skeleton
                    class="syn-account__state"
                    variant="list"
                    [rows]="6"
                    [ariaLabel]="config().inboxLoadingMessage || 'Cargando…'"
                  />
                }
              } @else if (items().length === 0) {
                <syn-empty-state
                  class="syn-account__state"
                  kind="first-use"
                  [title]="resolvedInboxEmptyTitle()"
                  [message]="resolvedInboxEmptyMessage()"
                  [actionLabel]="config().inboxEmptyActionLabel"
                  [actionHref]="config().inboxEmptyActionHref"
                  (action)="emptyAction.emit()"
                />
              } @else {
                <ul class="syn-account__list">
                  @for (item of items(); track $index) {
                    <li class="syn-account__list-item">
                      <button
                        type="button"
                        class="syn-account__row"
                        [class.is-selected]="selectedIndex() === $index"
                        [attr.aria-pressed]="selectedIndex() === $index"
                        (click)="selectItem($index)"
                      >
                        <ng-container
                          [ngTemplateOutlet]="itemTemplate()"
                          [ngTemplateOutletContext]="itemContext(item, $index)"
                        />
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>
            <div class="syn-account__detail-pane">
              @if (selectedItem() !== null && detailTemplate(); as detail) {
                <ng-container
                  [ngTemplateOutlet]="detail"
                  [ngTemplateOutletContext]="{ $implicit: selectedItem() }"
                />
              } @else {
                <p class="syn-account__placeholder">
                  {{ config().detailPlaceholder || 'Selecciona un elemento para ver el detalle.' }}
                </p>
              }
            </div>
          </div>
        } @else if (sectionTemplate(); as custom) {
          <div class="syn-account__section">
            <ng-container
              [ngTemplateOutlet]="custom"
              [ngTemplateOutletContext]="{ $implicit: section }"
            />
          </div>
        }
      }
    </div>
  `,
})
export class AccountShellComponent<TItem> {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input.required<AccountShellConfig>();
  /** Inbox rows ("mis X"). */
  readonly items = input<readonly TItem[]>([]);
  readonly loading = input(false);
  /** How to render one inbox row (inside the built-in row button). */
  readonly itemTemplate = input.required<TemplateRef<AccountItemContext<TItem>>>();
  /** Detail pane for the selected row. */
  readonly detailTemplate = input<TemplateRef<AccountDetailContext<TItem>> | null>(null);
  /** Content for every non-inbox section; switch on `$implicit.id` inside. */
  readonly sectionTemplate = input<TemplateRef<AccountSectionContext> | null>(null);
  /** Optional controlled active section id. */
  readonly section = input<string | undefined>(undefined);
  /** Optional custom loading surface; falls back to `syn-skeleton` (list). */
  readonly loadingTemplate = input<TemplateRef<unknown> | null>(null);
  /** When set, a persistent `syn-status-banner` ("datos de ejemplo") stacks on top. */
  readonly degradedMessage = input<string | undefined>(undefined);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly sectionchange = output<string>();
  readonly itemselect = output<TItem>();
  /** Emitted when the inline error-state retry is pressed. */
  readonly retry = output<void>();
  /** Emitted when the empty-inbox CTA (button) is pressed. */
  readonly emptyAction = output<void>();

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly activeSectionId = linkedSignal(
    () => this.section() ?? this.config().sections[0]?.id ?? '',
  );

  readonly activeSection = computed(
    () => this.config().sections.find((entry) => entry.id === this.activeSectionId()) ?? null,
  );

  /** Selection resets whenever the inbox items change. */
  readonly selectedIndex = linkedSignal<readonly TItem[], number>({
    source: this.items,
    computation: () => -1,
  });

  readonly selectedItem = computed<TItem | null>(() => {
    const index = this.selectedIndex();
    return index >= 0 ? (this.items()[index] ?? null) : null;
  });

  // ─── State surfaces (Fase 2) ────────────────────────────────────────────────
  readonly resolvedInboxEmptyTitle = computed(
    () => this.config().inboxEmptyTitle ?? 'Aún no hay nada aquí',
  );
  readonly resolvedInboxEmptyMessage = computed(
    () => this.config().inboxEmptyMessage ?? 'No hay elementos.',
  );

  // ─── Actions ───────────────────────────────────────────────────────────────
  isInbox(section: AccountSection): boolean {
    return (section.kind ?? 'custom') === 'inbox';
  }

  selectSection(id: string): void {
    if (id === this.activeSectionId()) {
      return;
    }
    this.activeSectionId.set(id);
    this.sectionchange.emit(id);
  }

  selectItem(index: number): void {
    if (index === this.selectedIndex()) {
      return;
    }
    this.selectedIndex.set(index);
    const item = this.items()[index];
    if (item !== undefined) {
      this.itemselect.emit(item);
    }
  }

  itemContext(item: TItem, index: number): AccountItemContext<TItem> {
    return { $implicit: item, index, selected: this.selectedIndex() === index };
  }
}
