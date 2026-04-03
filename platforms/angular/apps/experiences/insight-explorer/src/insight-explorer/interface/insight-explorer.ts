import { ChangeDetectionStrategy, Component, computed, effect, input } from '@angular/core';
import {
  CardComponent,
  HeadingComponent,
  LinkComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';
import { InsightState } from '../application/insight.state';
import { selectInsight, overrideItems } from '../application/use-cases/select-insight';
import { parseInsightItems } from '../infrastructure/insight-explorer.adapter';
import type { InsightExplorerConfig } from '../infrastructure/insight-explorer.config';

@Component({
  selector: 'sg-insight-explorer',
  imports: [CardComponent, HeadingComponent, LinkComponent],
  templateUrl: './insight-explorer.html',
  styleUrl: './insight-explorer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-insight-explorer' },
})
export class InsightExplorerComponent {
  readonly #state = new InsightState();

  readonly config = input<Partial<InsightExplorerConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<InsightExplorerConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.config()?.elementId, ''),
  );

  readonly items = this.#state.items;
  readonly selectedId = this.#state.selectedId;
  readonly selectedItem = this.#state.selectedItem;

  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-insight-explorer--${this.variant()} sg-insight-explorer--${this.theme()}`,
  );

  // eslint-disable-next-line no-unused-private-class-members
  readonly #itemsEffect = effect(() => {
    const raw = this.itemsInput();
    const parsed = parseInsightItems(raw);
    if (parsed) overrideItems(this.#state, parsed);
  });

  select(id: string): void {
    selectInsight(this.#state, id);
  }
}
