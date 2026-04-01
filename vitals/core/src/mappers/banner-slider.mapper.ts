import type { BannerSliderElementData } from '@synergos/contracts';
import type { BannerSliderInputs } from '../models/banner-slider-inputs.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function mapBannerSliderData(data: BannerSliderElementData): BannerSliderInputs {
  const rawItems = data.collection?.items ?? [];
  const items = rawItems
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = isRecord(item['text']) ? item['text'] : undefined;
      const media = isRecord(item['media']) ? item['media'] : undefined;
      const mediaData = isRecord(media?.['media']) ? media['media'] : undefined;
      const cta = isRecord(item['cta']) ? item['cta'] : undefined;
      const ctaLink = isRecord(cta?.['ctaLink']) ? cta['ctaLink'] : undefined;

      return {
        id: `slide-${index + 1}`,
        label: readString(text?.['title']).trim(),
        body: readString(text?.['body']).trim(),
        src: readString(mediaData?.['src']).trim(),
        alt: readString(media?.['altText']).trim() || readString(mediaData?.['alt']).trim(),
        ctaLabel: readString(cta?.['ctaLabel']).trim(),
        ctaUrl: readString(ctaLink?.['url']).trim(),
        ctaTarget: readString(ctaLink?.['target']).trim() || '_self',
      };
    })
    .filter((item) => Object.values(item ?? {}).some((value) => value !== ''));

  return {
    headingText: data.collection?.collectionTitle ?? data.text?.title ?? '',
    body: data.collection?.collectionDescription ?? data.text?.body ?? '',
    items: JSON.stringify(items),
    autoplay: 'false',
    loop: 'true',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
