import type { CartSummaryInputs } from '../models/cart-summary-inputs.model';
import {
  readBooleanAsString,
  readString,
  readStringFromKeys,
  readTheme,
  readVariant,
} from './shop-mapper.utils';

export function mapCartSummaryData(data: Record<string, unknown>): CartSummaryInputs {
  return {
    open: readBooleanAsString(data, 'open', false),
    showCoupon: readBooleanAsString(data, 'showCoupon', false),
    title: readStringFromKeys(data, ['title', 'summaryTitle'], ''),
    summaryTitle: readString(data, 'summaryTitle', ''),
    checkoutUrl: readStringFromKeys(data, ['checkoutUrl', 'checkoutEndpoint'], '/checkout'),
    checkoutEndpoint: readString(data, 'checkoutEndpoint', ''),
    continueShoppingUrl: readString(data, 'continueShoppingUrl', '/'),
    showShipping: readBooleanAsString(data, 'showShipping', false),
    showTax: readBooleanAsString(data, 'showTax', false),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readString(data, 'variantKey', ''),
  };
}
