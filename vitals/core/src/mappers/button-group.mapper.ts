import type { BaseElementData, ContentCollection } from '@synergos/contracts';
import type { ButtonGroupInputs } from '../models/button-group-inputs.model';

interface ButtonGroupElementData extends BaseElementData {
  collection?: ContentCollection;
}

export function mapButtonGroupData(data: ButtonGroupElementData): ButtonGroupInputs {
  return {
    buttons: JSON.stringify(data.collection?.items ?? []),
    alignment: data.domLayout?.alignment ?? 'left',
    gap: data.domSpacing?.gap ?? 'sm',
    direction: data.domLayout?.direction ?? 'row',
  };
}
