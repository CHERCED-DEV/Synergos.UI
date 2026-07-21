import type { VariantPickerInputs } from '../models/variant-picker-inputs.model';
import {
  readArrayAsJsonString,
  readStringFromKeys,
  readTheme,
  readVariant,
} from './shop-mapper.utils';

export function mapVariantPickerData(data: Record<string, unknown>): VariantPickerInputs {
  return {
    label: readStringFromKeys(data, ['label'], ''),
    selectedValue: readStringFromKeys(data, ['selectedValue'], ''),
    variantType: readStringFromKeys(data, ['variantType'], 'size'),
    displayAs: readStringFromKeys(data, ['displayAs'], 'buttons'),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readStringFromKeys(data, ['variantKey'], ''),
    variants: readArrayAsJsonString(data, 'variants'),
    variantsJson: readStringFromKeys(data, ['variantsJson'], ''),
  };
}
