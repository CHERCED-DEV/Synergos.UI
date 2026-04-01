import type { BaseElementData, ContentCta } from '@synergos/contracts';
import type { CtaGroupInputs } from '../models/cta-group-inputs.model';

interface CtaGroupElementData extends BaseElementData {
  primaryCta?: ContentCta;
  secondaryCta?: ContentCta;
}

export function mapCtaGroupData(data: CtaGroupElementData): CtaGroupInputs {
  return {
    primaryLabel: data.primaryCta?.ctaLabel ?? '',
    primaryUrl: data.primaryCta?.ctaLink?.url ?? '',
    primaryTarget: data.primaryCta?.ctaLink?.target ?? '_self',
    primaryVariant: 'solid',
    secondaryLabel: data.secondaryCta?.ctaLabel ?? '',
    secondaryUrl: data.secondaryCta?.ctaLink?.url ?? '',
    secondaryTarget: data.secondaryCta?.ctaLink?.target ?? '_self',
    secondaryVariant: 'outline',
    alignment: data.domLayout?.alignment ?? 'left',
  };
}
