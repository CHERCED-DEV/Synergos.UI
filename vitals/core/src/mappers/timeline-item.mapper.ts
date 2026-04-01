import type { TimelineItemElementData } from '@synergos/contracts';
import type { TimelineItemInputs } from '../models/timeline-item-inputs.model';

export function mapTimelineItemData(data: TimelineItemElementData): TimelineItemInputs {
  return {
    headingText: data.text?.title ?? '',
    body: data.text?.body ?? '',
    date: data.date?.publishDate ?? data.date?.updateDate ?? '',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
