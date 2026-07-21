import type { SpacerElementData } from '@synergos/contracts';
import type { SpacerInputs } from '../models/spacer-inputs.model';

export function mapSpacerData(data: SpacerElementData): SpacerInputs {
  return {
    size: data.domSpacing?.gap ?? data.domSpacing?.margin ?? 'md',
    axis: data.domLayout?.direction === 'row' ? 'horizontal' : 'vertical',
  };
}
