import type { CardElementData } from '@synergos/contracts';
import type { CardInputs } from '../models/card-inputs.model';

export function mapCardData(data: CardElementData): CardInputs {
  return {
    title: data.text?.title ?? '',
    subtitle: data.text?.subtitle ?? '',
    body: data.text?.body ?? '',
    imageSrc: data.media?.media?.src ?? '',
    imageAlt: data.media?.media?.alt ?? data.media?.altText ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    badgeText: data.badge?.badgeText ?? '',
    badgeType: data.badge?.badgeType ?? '',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
