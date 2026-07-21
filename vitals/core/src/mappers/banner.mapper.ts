import type { CtaBannerElementData } from '@synergos/contracts';
import type { BannerInputs } from '../models/banner-inputs.model';

export function mapBannerData(data: CtaBannerElementData): BannerInputs {
  return {
    eyebrow: data.heading?.headingText ?? data.text?.subtitle ?? '',
    title: data.text?.title ?? '',
    body: data.text?.body ?? '',
    imageSrc: data.media?.media?.src ?? '',
    imageAlt: data.media?.media?.alt ?? data.media?.altText ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    ctaTarget: data.cta?.ctaLink?.target ?? '_self',
    secondaryCtaLabel: data.secondaryCta?.ctaLabel ?? '',
    secondaryCtaUrl: data.secondaryCta?.ctaLink?.url ?? '',
    secondaryCtaTarget: data.secondaryCta?.ctaLink?.target ?? '_self',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
