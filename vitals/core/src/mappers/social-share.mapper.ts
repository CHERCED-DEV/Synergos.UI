import type { SocialShareElementData } from '@synergos/contracts';
import type { SocialShareInputs } from '../models/social-share-inputs.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function mapSocialShareData(data: SocialShareElementData): SocialShareInputs {
  const rawItems = data.collection?.items ?? [];
  const links = rawItems
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = isRecord(item['text']) ? item['text'] : undefined;
      const cta = isRecord(item['cta']) ? item['cta'] : undefined;
      const ctaLink = isRecord(cta?.['ctaLink']) ? cta['ctaLink'] : undefined;
      const media = isRecord(item['media']) ? item['media'] : undefined;
      const href = readString(ctaLink?.['url']).trim();

      if (!href) {
        return null;
      }

      return {
        label: readString(text?.['title']).trim() || readString(cta?.['ctaLabel']).trim() || 'Share',
        href,
        iconSymbol: readString(media?.['mediaTitle']).trim(),
        target: readString(ctaLink?.['target']).trim() || '_blank',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    title: data.collection?.collectionTitle ?? 'Share',
    pageUrl: '',
    links: JSON.stringify(links),
    layout: 'row',
  };
}
