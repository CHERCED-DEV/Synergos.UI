import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-grid',
  imports: [],
  templateUrl: './grid.html',
  styleUrl: './grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-grid' },
})
export class GridComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly columns = input<number>(3);
  readonly gap = input<string>('md');
  readonly minColumnWidth = input<string>('');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly gridStyle = computed(() => {
    const min = this.minColumnWidth();
    if (min) {
      return `grid-template-columns: repeat(auto-fill, minmax(${min}, 1fr))`;
    }
    return `grid-template-columns: repeat(${this.columns()}, 1fr)`;
  });
  readonly hostClasses = computed(() => `sg-grid--gap-${this.gap()} sg-grid--${this.theme()}`);
}
