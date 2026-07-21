import type { GridElementData } from '@synergos/contracts';
import type { GridInputs } from '../models/grid-inputs.model';

export function mapGridData(data: GridElementData): GridInputs {
  return {
    columns: '3',
    gap: data.domSpacing?.gap ?? 'md',
    minColumnWidth: '',
    theme: data.domVariant?.theme ?? 'light',
  };
}
