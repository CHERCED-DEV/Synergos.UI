import type { InsightState } from '../insight.state';
import type { InsightItem } from '../../domain/models/insight-item.model';

export function selectInsight(state: InsightState, id: string): void {
  if (state.items().some((i) => i.id === id)) {
    state.selectedId.set(id);
  }
}

export function overrideItems(state: InsightState, items: readonly InsightItem[]): void {
  if (items.length > 0) {
    state.items.set(items);
    state.selectedId.set(items[0].id);
  }
}
