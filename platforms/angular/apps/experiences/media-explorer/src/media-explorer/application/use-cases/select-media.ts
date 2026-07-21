import type { MediaState } from '../media.state';
import type { MediaItem } from '../../domain/models/media-item.model';

export function selectMedia(state: MediaState, id: string): void {
  if (state.items().some((i) => i.id === id)) {
    state.selectedId.set(id);
    state.isPlayerActive.set(false);
  }
}

export function activatePlayer(state: MediaState): void {
  if (state.selectedItem()) {
    state.isPlayerActive.set(true);
  }
}

export function loadItems(state: MediaState, items: readonly MediaItem[]): void {
  if (items.length > 0) {
    state.items.set(items);
    state.selectedId.set(items[0].id);
    state.isPlayerActive.set(false);
  }
}

export function filterByCategory(state: MediaState, category: string): void {
  state.activeFilter.set(category);
  const filtered = state.filteredItems();
  if (filtered.length > 0) {
    state.selectedId.set(filtered[0].id);
    state.isPlayerActive.set(false);
  }
}
