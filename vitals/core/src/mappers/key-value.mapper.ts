import type { KeyValueElementData } from '@synergos/contracts';
import type { KeyValueInputs } from '../models/key-value-inputs.model';

export function mapKeyValueData(data: KeyValueElementData): KeyValueInputs {
  return {
    label: data.text?.title ?? '',
    value: data.text?.body ?? data.text?.summary ?? '',
    helpText: data.text?.caption ?? '',
    theme: data.domVariant?.theme ?? 'light',
  };
}
