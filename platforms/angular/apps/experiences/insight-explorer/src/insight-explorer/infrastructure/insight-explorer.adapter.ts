import type { InsightItem } from '../domain/models/insight-item.model';

export function parseInsightItems(raw: string | undefined): readonly InsightItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as InsightItem[]) : null;
  } catch {
    return null;
  }
}
