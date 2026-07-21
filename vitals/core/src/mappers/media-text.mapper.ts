import type { MediaTextSplitElementData } from '@synergos/contracts';
import type { MediaTextInputs } from '../models/media-text-inputs.model';

export function mapMediaTextData(data: MediaTextSplitElementData): MediaTextInputs {
  return {
    imageSrc: data.media?.media?.src ?? '',
    imageAlt: data.media?.media?.alt ?? data.media?.altText ?? '',
    headingText: data.text?.title ?? '',
    body: data.text?.body ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    ctaTarget: data.cta?.ctaTarget ?? data.cta?.ctaLink?.target ?? '_self',
    mediaPosition: data.domLayout?.alignment ?? 'left',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
