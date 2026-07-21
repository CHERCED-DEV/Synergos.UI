import type { LinkElementData } from '@synergos/contracts';
import type { LinkBlockInputs } from '../models/link-block-inputs.model';

export function mapLinkBlockData(data: LinkElementData): LinkBlockInputs {
  return {
    href: data.cta?.ctaLink?.url ?? '',
    label: data.cta?.ctaLabel ?? '',
    target: data.cta?.ctaLink?.target ?? '_self',
    ariaLabel: data.cta?.ctaAriaLabel ?? '',
    variant: data.domVariant?.variant ?? 'default',
  };
}
