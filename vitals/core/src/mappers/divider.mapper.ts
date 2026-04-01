import type { DividerElementData } from '@synergos/contracts';
import type { DividerInputs } from '../models/divider-inputs.model';

export function mapDividerData(data: DividerElementData): DividerInputs {
  return {
    orientation: 'horizontal',
    inset: data.domSpacing?.margin ?? 'none',
    theme: data.domVariant?.theme ?? 'light',
  };
}
