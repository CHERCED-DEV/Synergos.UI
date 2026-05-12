import { ChangeDetectionStrategy, Component, computed, effect, input } from '@angular/core';
import type { ComponentTranslations } from '@synergos/contracts';
import {
  BadgeComponent,
  HeadingComponent,
  type HeadingTone,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';
import { MediaState } from '../application/media.state';
import {
  selectMedia,
  activatePlayer,
  loadItems,
  filterByCategory,
} from '../application/use-cases/select-media';
import { parseMediaItems } from '../infrastructure/media-explorer.adapter';
import type { MediaExplorerConfig } from '../infrastructure/media-explorer.config';

function sanitizeMediaExplorerConfig(
  value: Partial<MediaExplorerConfig>,
): Partial<MediaExplorerConfig> {
  return omitUndefinedProperties<Partial<MediaExplorerConfig>>({
    title: coerceTrimmedStringInput(value.title),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    elementId: coerceTrimmedStringInput(value.elementId),
    defaultCategory: coerceTrimmedStringInput(value.defaultCategory),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-media-explorer',
  imports: [BadgeComponent, HeadingComponent],
  templateUrl: './media-explorer.html',
  styleUrl: './media-explorer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-media-explorer' },
})
export class MediaExplorerComponent {
  readonly #state = new MediaState();

  readonly config = input<Partial<MediaExplorerConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<MediaExplorerConfig>(sanitizeMediaExplorerConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly defaultCategoryInput = input<string | undefined>(undefined, { alias: 'defaultCategory' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'dark'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.config()?.elementId, ''),
  );

  readonly items = this.#state.filteredItems;
  readonly allItems = this.#state.items;
  readonly selectedItem = this.#state.selectedItem;
  readonly selectedId = this.#state.selectedId;
  readonly isPlayerActive = this.#state.isPlayerActive;
  readonly isEmpty = this.#state.isEmpty;
  readonly categories = this.#state.availableCategories;
  readonly activeFilter = this.#state.activeFilter;
  readonly translations = computed<ComponentTranslations>(() => this.config()?.translations ?? {});

  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-media-explorer--${this.variant()} sg-media-explorer--${this.theme()}`,
  );
  readonly filtersAriaLabel = computed(() => this.translations()['filtersAriaLabel'] ?? 'Filter media by category');
  readonly allCategoriesLabel = computed(() => this.translations()['allCategoriesLabel'] ?? 'All');
  readonly emptyStateLabel = computed(() => this.translations()['emptyStateLabel'] ?? 'No videos available.');
  readonly videoListLabel = computed(() => this.translations()['videoListLabel'] ?? 'Video list');
  readonly videoPlayerLabel = computed(() => this.translations()['videoPlayerLabel'] ?? 'Video player');
  readonly playVideoLabel = computed(() => this.translations()['playVideoLabel'] ?? 'Play');

  // eslint-disable-next-line no-unused-private-class-members
  readonly #loadEffect = effect(() => {
    const raw = this.itemsInput();
    const parsed = parseMediaItems(raw);
    if (parsed) {
      loadItems(this.#state, parsed);
      const cat = this.defaultCategoryInput() ?? this.config()?.defaultCategory;
      if (cat) filterByCategory(this.#state, cat);
    }
  });

  select(id: string): void { selectMedia(this.#state, id); }
  play(): void { activatePlayer(this.#state); }
  filter(category: string): void { filterByCategory(this.#state, category); }
  clearFilter(): void { filterByCategory(this.#state, ''); }
  playItemLabel(title: string): string { return `${this.playVideoLabel()} ${title}`; }
}
