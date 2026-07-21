import type { MediaItem } from '../domain/models/media-item.model';

export function parseMediaItems(raw: string | undefined): readonly MediaItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as MediaItem[]) : null;
  } catch {
    return null;
  }
}
