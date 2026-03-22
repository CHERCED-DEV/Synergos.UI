import type { HeroElementData } from '../contracts/elements.contract';
import type { HeroInputs } from '../models/hero-inputs.model';

export function mapHeroData(data: HeroElementData): HeroInputs {
  return {
    headingText: data.heading?.headingText ?? '',
    headingLevel: data.heading?.headingLevel ?? 'h1',
    body: data.text?.body ?? '',
    imageSrc: data.media?.media?.src ?? '',
    imageAlt: data.media?.media?.alt ?? data.media?.altText ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    ctaTarget: data.cta?.ctaLink?.target ?? '_self',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
