import { computed, signal } from '@angular/core';
import { DEFAULT_INSIGHTS } from '../domain/insight.domain';
import type { InsightItem } from '../domain/models/insight-item.model';

export class InsightState {
  readonly items = signal<readonly InsightItem[]>(DEFAULT_INSIGHTS);
  readonly selectedId = signal<string>(DEFAULT_INSIGHTS[0].id);

  readonly selectedItem = computed(
    () => this.items().find((i) => i.id === this.selectedId()) ?? this.items()[0],
  );
  readonly hasItems = computed(() => this.items().length > 0);
}
