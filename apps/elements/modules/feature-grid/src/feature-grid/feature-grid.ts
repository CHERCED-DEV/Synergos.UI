import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  effect,
  inject,
} from '@angular/core';
import { LoggerService } from '@synergos/core';

@Component({
  selector: 'sg-feature-grid',
  imports: [],
  templateUrl: './feature-grid.html',
  styleUrl: './feature-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-grid' },
})
export class FeatureGridComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly headingText = input<string>('');
  readonly columns = input<number>(3);
  readonly items = input<string>('[]');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly parsedItems = computed(() => {
    try { return JSON.parse(this.items()); }
    catch { return []; }
  });
  readonly gridStyle = computed(() => `grid-template-columns: repeat(${this.columns()}, 1fr)`);
  readonly hostClasses = computed(() => `sg-feature-grid--${this.theme()}`);

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-feature-grid] inputs', {
        headingText: this.headingText(),
        columns: this.columns(),
        items: this.items(),
      });
    });
  }
}
