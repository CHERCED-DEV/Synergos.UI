import type { ProductDetailInputs } from '../models/product-detail-inputs.model';
import {
  readBooleanAsString,
  readString,
  readTheme,
  readVariant,
} from './shop-mapper.utils';

export function mapProductDetailData(data: Record<string, unknown>): ProductDetailInputs {
  return {
    productSku: readString(data, 'productSku', readString(data, 'sku', '')),
    showVariantPicker: readBooleanAsString(data, 'showVariantPicker', true),
    showQuantitySelector: readBooleanAsString(data, 'showQuantitySelector', true),
    showRating: readBooleanAsString(data, 'showRating', true),
    showReviews: readBooleanAsString(data, 'showReviews', false),
    showRelated: readBooleanAsString(data, 'showRelated', false),
    layout: readString(data, 'layout', 'imageLeft'),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readString(data, 'variantKey', ''),
  };
}
