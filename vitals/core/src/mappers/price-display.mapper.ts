import type { PriceDisplayInputs } from '../models/price-display-inputs.model';
import {
  readBooleanAsString,
  readNumberAsString,
  readString,
  readTheme,
  readVariant,
} from './shop-mapper.utils';

export function mapPriceDisplayData(data: Record<string, unknown>): PriceDisplayInputs {
  return {
    showOriginalPrice: readBooleanAsString(data, 'showOriginalPrice', true),
    showDiscount: readBooleanAsString(data, 'showDiscount', true),
    priceSize: readString(data, 'priceSize', 'md'),
    currency: readString(data, 'currency', 'COP'),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    price: readNumberAsString(data, 'price', 0),
    originalPrice: readNumberAsString(data, 'originalPrice', 0),
    discount: readNumberAsString(data, 'discount', 0),
  };
}
