import { computed, signal } from '@angular/core';
import type { MediaItem } from '../domain/models/media-item.model';

export class MediaState {
  readonly items = signal<readonly MediaItem[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly isPlayerActive = signal(false);

  readonly selectedItem = computed<MediaItem | null>(() => {
    const id = this.selectedId();
    const items = this.items();
    if (!id || items.length === 0) return null;
    return items.find((i) => i.id === id) ?? items[0];
  });

  readonly hasItems = computed(() => this.items().length > 0);
  readonly isEmpty = computed(() => this.items().length === 0);

  readonly activeFilter = signal<string>('');
  readonly filteredItems = computed(() => {
    const filter = this.activeFilter();
    if (!filter) return this.items();
    return this.items().filter(
      (i) => i.category === filter || i.tags.includes(filter),
    );
  });

  readonly availableCategories = computed(() => {
    const cats = new Set<string>();
    for (const item of this.items()) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats);
  });
}
