import type { FilterConfig } from './filter.config';
import type { FilterItem } from '../domain/filter.domain';

export interface FilterInstance {
  readonly title: string;
  readonly items: FilterItem[];
  readonly theme: string;
}

export function adaptFilterConfig(raw: Partial<FilterConfig> | undefined): FilterInstance {
  return {
    title: raw?.title ?? '',
    items: (raw?.items ?? []).map((item) => ({
      title: item.title ?? '',
      body: item.body ?? '',
      tags: item.tags ?? [],
    })),
    theme: raw?.theme ?? 'light',
  };
}
