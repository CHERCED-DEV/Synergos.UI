import type { BaseElementData, ContentText, ContentMedia } from '@synergos/contracts';
import type { StatCounterInputs } from '../models/stat-counter-inputs.model';

interface StatCounterElementData extends BaseElementData {
  text?: ContentText;
  media?: ContentMedia;
  value?: string;
  prefix?: string;
  suffix?: string;
  trend?: string;
  trendLabel?: string;
}

export function mapStatCounterData(data: StatCounterElementData): StatCounterInputs {
  return {
    value: data.value ?? '',
    label: data.text?.title ?? '',
    prefix: data.prefix ?? '',
    suffix: data.suffix ?? '',
    icon: data.media?.media?.src ?? '',
    trend: data.trend ?? '',
    trendLabel: data.trendLabel ?? '',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
