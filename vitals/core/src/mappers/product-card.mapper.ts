import type { ProductCardInputs } from '../models/product-card-inputs.model';
import {
  readBooleanAsString,
  readMediaImage,
  readString,
  readStringFromKeys,
  readTheme,
  readVariant,
  normalizeProductCardLayout,
} from './shop-mapper.utils';

export function mapProductCardData(data: Record<string, unknown>): ProductCardInputs {
  const media = readMediaImage(data);

  return {
    productSku: readStringFromKeys(data, ['productSku', 'sku'], ''),
    productUrlTemplate: readString(data, 'productUrlTemplate', ''),
    name: readString(data, 'name', ''),
    imageSrc: media.src,
    imageAlt: media.alt,
    showPrice: readBooleanAsString(data, 'showPrice', true),
    showBadge: readBooleanAsString(data, 'showBadge', true),
    layout: normalizeProductCardLayout(readStringFromKeys(data, ['layout', 'cardLayout'], 'vertical')),
    cardLayout: readString(data, 'cardLayout', ''),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readString(data, 'variantKey', ''),
  };
}
