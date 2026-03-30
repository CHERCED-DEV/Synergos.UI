import type { IconElementData } from '@synergos/contracts';
import type { IconBlockInputs } from '../models/icon-block-inputs.model';

export function mapIconBlockData(data: IconElementData): IconBlockInputs {
  return {
    icon: data.media?.media?.src ?? '',
    size: 'md',
    color: '',
    ariaLabel: data.media?.altText ?? '',
  };
}
