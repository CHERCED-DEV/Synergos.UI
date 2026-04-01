import type { BadgeElementData } from '@synergos/contracts';
import type { BadgeInputs } from '../models/badge-inputs.model';

function resolveBadgeTone(value: string): string {
  if (value === 'inverse') {
    return 'inverse';
  }

  if (value === 'brand' || value === 'info' || value === 'success' || value === 'accent') {
    return 'brand';
  }

  return 'neutral';
}

export function mapBadgeData(data: BadgeElementData): BadgeInputs {
  const text = data.badge?.badgeText ?? '';

  return {
    text,
    ariaLabel: data.domAttributes?.ariaLabel ?? text,
    tone: resolveBadgeTone(data.badge?.badgeType ?? ''),
  };
}
