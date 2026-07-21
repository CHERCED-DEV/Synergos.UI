import type { BaseElementData, ContentText, ContentCta } from '@synergos/contracts';
import type { InfoBlockInputs } from '../models/info-block-inputs.model';

interface InfoBlockElementData extends BaseElementData {
  text?: ContentText;
  cta?: ContentCta;
}

export function mapInfoBlockData(data: InfoBlockElementData): InfoBlockInputs {
  return {
    title: data.text?.title ?? '',
    body: data.text?.body ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
