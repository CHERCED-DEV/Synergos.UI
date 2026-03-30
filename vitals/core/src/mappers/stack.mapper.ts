import type { StackElementData } from '@synergos/contracts';
import type { StackInputs } from '../models/stack-inputs.model';

export function mapStackData(data: StackElementData): StackInputs {
  return {
    direction: data.domLayout?.direction ?? 'column',
    gap: data.domSpacing?.gap ?? 'md',
    alignment: data.domLayout?.alignment ?? 'stretch',
    wrap: 'false',
    theme: data.domVariant?.theme ?? 'light',
  };
}
