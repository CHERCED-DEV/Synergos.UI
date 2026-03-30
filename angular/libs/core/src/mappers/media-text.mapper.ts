import type { MediaTextSplitElementData } from '../contracts/elements.contract';
import type { MediaTextInputs } from '../models/media-text-inputs.model';

export function mapMediaTextData(data: MediaTextSplitElementData): MediaTextInputs {
  return {
    imageSrc: data.media?.media?.src ?? '',
    imageAlt: data.media?.media?.alt ?? data.media?.altText ?? '',
    headingText: data.text?.title ?? '',
    body: data.text?.body ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    mediaPosition: data.domLayout?.alignment ?? 'left',
    theme: data.domVariant?.theme ?? 'light',
  };
}
