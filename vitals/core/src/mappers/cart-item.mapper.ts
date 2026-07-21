import type { CartItemInputs } from '../models/cart-item-inputs.model';
import type { CartItem } from '@synergos/contracts';
import {
  parseCurrencyLikeNumber,
  readJsonValueAsString,
  readNumberAsStringFromKeys,
  readStringFromKeys,
  readTheme,
  readVariant,
} from './shop-mapper.utils';

export function mapCartItemData(data: Record<string, unknown>): CartItemInputs {
  const directItem = readJsonValueAsString(data, 'item');
  if (directItem) {
    return {
      item: directItem,
      productSku: readStringFromKeys(data, ['productSku', 'sku'], ''),
      quantity: readNumberAsStringFromKeys(data, ['quantity'], 1),
      unitPrice: readStringFromKeys(data, ['unitPrice'], ''),
      updateEndpoint: readStringFromKeys(data, ['updateEndpoint'], ''),
      theme: readTheme(data, 'light'),
      variant: readVariant(data, 'default'),
      variantKey: readStringFromKeys(data, ['variantKey'], ''),
    };
  }

  const sku = readStringFromKeys(data, ['productSku', 'sku'], '');
  const quantityRaw = readNumberAsStringFromKeys(data, ['quantity'], 1);
  const quantity = Number(quantityRaw);
  const unitPriceRaw = readStringFromKeys(data, ['unitPrice'], '0');
  const price = parseCurrencyLikeNumber(unitPriceRaw, 0);

  const fallbackItem: CartItem = {
    productId: readStringFromKeys(data, ['productId', 'productSku', 'sku'], sku),
    sku,
    name: readStringFromKeys(data, ['name', 'productName', 'productSku', 'sku'], sku),
    image: readStringFromKeys(data, ['image', 'imageSrc'], ''),
    price,
    currency: readStringFromKeys(data, ['currency'], 'COP'),
    quantity: Number.isFinite(quantity) ? quantity : 1,
    subtotal: price * (Number.isFinite(quantity) ? quantity : 1),
  };

  return {
    item: JSON.stringify(fallbackItem),
    productSku: sku,
    quantity: quantityRaw,
    unitPrice: unitPriceRaw,
    updateEndpoint: readStringFromKeys(data, ['updateEndpoint'], ''),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readStringFromKeys(data, ['variantKey'], ''),
  };
}
