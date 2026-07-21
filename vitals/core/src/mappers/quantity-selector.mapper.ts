import type { QuantitySelectorInputs } from '../models/quantity-selector-inputs.model';
import {
  readNumberAsString,
  readNumberAsStringFromKeys,
  readStringFromKeys,
  readTheme,
  readVariant,
} from './shop-mapper.utils';

export function mapQuantitySelectorData(data: Record<string, unknown>): QuantitySelectorInputs {
  return {
    min: readNumberAsStringFromKeys(data, ['min', 'minQty'], 1),
    minQty: readNumberAsStringFromKeys(data, ['minQty'], 1),
    max: readNumberAsStringFromKeys(data, ['max', 'maxQty'], 99),
    maxQty: readNumberAsStringFromKeys(data, ['maxQty'], 99),
    step: readNumberAsString(data, 'step', 1),
    value: readNumberAsStringFromKeys(data, ['value', 'initialQty'], 1),
    initialQty: readNumberAsStringFromKeys(data, ['initialQty'], 1),
    label: readStringFromKeys(data, ['label', 'ariaLabel'], ''),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readStringFromKeys(data, ['variantKey'], ''),
  };
}
