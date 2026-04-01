import type { ContainerElementData } from '@synergos/contracts';
import type { ContainerBlockInputs } from '../models/container-block-inputs.model';

export function mapContainerBlockData(data: ContainerElementData): ContainerBlockInputs {
  return {
    elementId: data.domAttributes?.elementId ?? '',
    ariaLabel: data.domAttributes?.ariaLabel ?? '',
    containerType: data.domLayout?.containerType ?? 'default',
    maxWidth: '',
    padding: data.domSpacing?.padding ?? 'md',
    theme: data.domVariant?.theme ?? 'light',
  };
}
