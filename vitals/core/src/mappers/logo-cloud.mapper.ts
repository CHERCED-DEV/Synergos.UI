import type { LogoCloudElementData } from '@synergos/contracts';
import type { LogoCloudInputs } from '../models/logo-cloud-inputs.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function mapLogoCloudData(data: LogoCloudElementData): LogoCloudInputs {
  const rawItems = data.collection?.items ?? [];
  const items = rawItems
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const media = isRecord(item['media']) ? item['media'] : undefined;
      const mediaData = isRecord(media?.['media']) ? media['media'] : undefined;
      const text = isRecord(item['text']) ? item['text'] : undefined;
      const cta = isRecord(item['cta']) ? item['cta'] : undefined;
      const ctaLink = isRecord(cta?.['ctaLink']) ? cta['ctaLink'] : undefined;

      const src = readString(mediaData?.['src']).trim();
      if (!src) {
        return null;
      }

      return {
        src,
        alt: readString(media?.['altText']).trim() || readString(mediaData?.['alt']).trim(),
        label: readString(text?.['title']).trim() || readString(media?.['mediaTitle']).trim(),
        href: readString(ctaLink?.['url']).trim(),
        target: readString(ctaLink?.['target']).trim() || '_self',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    headingText: data.collection?.collectionTitle ?? data.text?.title ?? '',
    body: data.collection?.collectionDescription ?? data.text?.body ?? '',
    items: JSON.stringify(items),
    columns: '4',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
