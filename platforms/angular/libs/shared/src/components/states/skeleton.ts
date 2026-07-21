import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * `syn-skeleton` — layout-mimicking loading placeholder (doc 22 §6, item 2).
 *
 * Replaces the bare `<p>Cargando…</p>` with a **1:1 mould** of the real content
 * so the swap to `ready` produces **zero CLS**. Domain-free: the `variant`
 * selects a canonical shape (list / card / table / text) and `rows` sets how
 * many repeats, so the same shell can mimic a results grid, an inbox list or a
 * table without knowing the domain.
 *
 * A11y: `role="status"` + `aria-busy="true"` announce "busy" to AT; the shimmer
 * is decorative and honours `prefers-reduced-motion` (falls back to a static
 * tinted surface, no animation) via tokenised motion.
 */
export type SkeletonVariant = 'list' | 'card' | 'table' | 'text';

@Component({
  selector: 'syn-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'syn-skeleton',
    role: 'status',
    '[attr.aria-busy]': "'true'",
    '[attr.aria-label]': 'ariaLabel() || "Cargando…"',
    '[attr.data-variant]': 'variant()',
  },
  styleUrl: './skeleton.scss',
  template: `
    @switch (variant()) {
      @case ('list') {
        @for (row of repeats(); track row) {
          <div class="syn-skeleton__row">
            <span class="syn-skeleton__bone syn-skeleton__bone--avatar" aria-hidden="true"></span>
            <div class="syn-skeleton__lines">
              <span class="syn-skeleton__bone syn-skeleton__bone--title" aria-hidden="true"></span>
              <span class="syn-skeleton__bone syn-skeleton__bone--text" aria-hidden="true"></span>
            </div>
          </div>
        }
      }
      @case ('card') {
        <div class="syn-skeleton__cards">
          @for (card of repeats(); track card) {
            <div class="syn-skeleton__card">
              <span class="syn-skeleton__bone syn-skeleton__bone--media" aria-hidden="true"></span>
              <span class="syn-skeleton__bone syn-skeleton__bone--title" aria-hidden="true"></span>
              <span class="syn-skeleton__bone syn-skeleton__bone--text" aria-hidden="true"></span>
            </div>
          }
        </div>
      }
      @case ('table') {
        <div class="syn-skeleton__table">
          <div class="syn-skeleton__tr syn-skeleton__tr--head">
            @for (cell of columnsRange(); track cell) {
              <span class="syn-skeleton__bone syn-skeleton__bone--cell" aria-hidden="true"></span>
            }
          </div>
          @for (row of repeats(); track row) {
            <div class="syn-skeleton__tr">
              @for (cell of columnsRange(); track cell) {
                <span class="syn-skeleton__bone syn-skeleton__bone--cell" aria-hidden="true"></span>
              }
            </div>
          }
        </div>
      }
      @default {
        @for (row of repeats(); track row) {
          <span class="syn-skeleton__bone syn-skeleton__bone--text" aria-hidden="true"></span>
        }
      }
    }
  `,
})
export class SynSkeletonComponent {
  /** How many repeats (rows / cards / list items). Clamped to >= 1. */
  readonly rows = input(3);
  /** Canonical shape to mimic. */
  readonly variant = input<SkeletonVariant>('text');
  /** How many columns for the `table` variant. Clamped to >= 1. */
  readonly columns = input(4);
  /** Accessible label announced while busy (default "Cargando…"). */
  readonly ariaLabel = input<string>();

  readonly repeats = computed(() => range(this.rows()));
  readonly columnsRange = computed(() => range(this.columns()));
}

function range(count: number): readonly number[] {
  const n = Math.max(1, Math.floor(count) || 1);
  return Array.from({ length: n }, (_, index) => index);
}
