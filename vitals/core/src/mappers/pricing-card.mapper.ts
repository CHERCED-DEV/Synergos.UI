import type { BaseElementData, ContentText, ContentCta, ContentCollection } from '@synergos/contracts';
import type { PricingCardInputs } from '../models/pricing-card-inputs.model';

interface PricingCardElementData extends BaseElementData {
  text?: ContentText;
  cta?: ContentCta;
  collection?: ContentCollection;
  planName?: string;
  price?: string;
  period?: string;
  highlighted?: boolean;
}

export function mapPricingCardData(data: PricingCardElementData): PricingCardInputs {
  const features = (data.collection?.items ?? []).map(
    (item) => String(item['label'] ?? item['text'] ?? ''),
  );

  return {
    planName: data.planName ?? data.text?.title ?? '',
    price: data.price ?? '',
    period: data.period ?? '/mo',
    features: JSON.stringify(features),
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    highlighted: String(data.highlighted ?? false),
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
