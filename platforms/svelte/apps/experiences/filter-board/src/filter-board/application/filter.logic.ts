import type { FilterItem } from '../domain/filter.domain';

export function countByTag(items: FilterItem[], tag: string): number {
  return items.filter((item) => item.tags.includes(tag)).length;
}
