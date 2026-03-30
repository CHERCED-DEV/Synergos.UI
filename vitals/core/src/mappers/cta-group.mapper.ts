import type { BaseElementData } from '@synergos/contracts';
import type { CtaGroupInputs } from '../models/cta-group-inputs.model';

interface CtaGroupElementData extends BaseElementData {
  primaryLabel?: string;
  primaryUrl?: string;
  secondaryLabel?: string;
  secondaryUrl?: string;
}

export function mapCtaGroupData(data: CtaGroupElementData): CtaGroupInputs {
  return {
    primaryLabel: data.primaryLabel ?? '',
    primaryUrl: data.primaryUrl ?? '',
    secondaryLabel: data.secondaryLabel ?? '',
    secondaryUrl: data.secondaryUrl ?? '',
    alignment: data.domLayout?.alignment ?? 'left',
  };
}
