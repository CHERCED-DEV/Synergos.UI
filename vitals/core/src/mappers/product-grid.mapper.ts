import type { ProductGridInputs } from '../models/product-grid-inputs.model';
import {
  readBooleanAsString,
  readHeadingText,
  readNumberAsString,
  readString,
  readStringFromKeys,
  readTheme,
  readVariant,
  normalizeProductGridSort,
} from './shop-mapper.utils';

export function mapProductGridData(data: Record<string, unknown>): ProductGridInputs {
  return {
    headingText: readHeadingText(data, ''),
    categoryAlias: readStringFromKeys(data, ['categoryAlias', 'categoryFilter'], ''),
    categoryFilter: readString(data, 'categoryFilter', ''),
    productUrlTemplate: readString(data, 'productUrlTemplate', ''),
    maxItems: readNumberAsString(data, 'maxItems', 12),
    columns: readNumberAsString(data, 'columns', 3),
    showFilters: readBooleanAsString(data, 'showFilters', false),
    sortOrder: normalizeProductGridSort(readStringFromKeys(data, ['sortOrder', 'sortBy'], 'relevance')),
    sortBy: readString(data, 'sortBy', ''),
    layout: readString(data, 'layout', ''),
    theme: readTheme(data, 'light'),
    variant: readVariant(data, 'default'),
    variantKey: readString(data, 'variantKey', ''),
  };
}
