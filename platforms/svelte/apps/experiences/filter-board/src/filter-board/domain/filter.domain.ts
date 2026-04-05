export interface FilterItem {
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
}

export function getAllTags(items: FilterItem[]): string[] {
  const all = items.flatMap((item) => item.tags);
  return [...new Set(all)];
}

export function filterByTag(items: FilterItem[], tag: string | null): FilterItem[] {
  if (!tag) return items;
  return items.filter((item) => item.tags.includes(tag));
}
