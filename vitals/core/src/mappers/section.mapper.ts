import type { SectionElementData } from '@synergos/contracts';
import type { SectionInputs } from '../models/section-inputs.model';

export function mapSectionData(data: SectionElementData): SectionInputs {
  return {
    headingText: '',
    headingLevel: 'h2',
    containerType: data.domLayout?.containerType ?? 'fluid',
    alignment: data.domLayout?.alignment ?? 'start',
    direction: data.domLayout?.direction ?? 'column',
    margin: data.domSpacing?.margin ?? '',
    padding: data.domSpacing?.padding ?? '',
    gap: data.domSpacing?.gap ?? '',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
