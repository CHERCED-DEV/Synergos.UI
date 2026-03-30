import type { CtaBannerElementData } from '../contracts/elements.contract';
import type { BannerInputs } from '../models/banner-inputs.model';

export function mapBannerData(data: CtaBannerElementData): BannerInputs {
  return {
    title: data.text?.title ?? '',
    body: data.text?.body ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    ctaTarget: data.cta?.ctaLink?.target ?? '_self',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
