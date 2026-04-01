import type { ColumnElementData } from '@synergos/contracts';
import type { ColumnInputs } from '../models/column-inputs.model';

export function mapColumnData(data: ColumnElementData): ColumnInputs {
  return {
    width: '',
    minWidth: '',
    alignment: data.domLayout?.alignment ?? 'stretch',
    padding: data.domSpacing?.padding ?? 'md',
    gap: data.domSpacing?.gap ?? 'md',
    theme: data.domVariant?.theme ?? 'light',
  };
}
