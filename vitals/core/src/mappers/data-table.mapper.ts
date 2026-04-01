import type { DataTableElementData } from '@synergos/contracts';
import type { DataTableInputs } from '../models/data-table-inputs.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function mapDataTableData(data: DataTableElementData): DataTableInputs {
  const rows = (data.collection?.items ?? []).filter(
    (item): item is Record<string, unknown> => isRecord(item),
  );
  const firstRow = rows[0] ?? {};
  const columns = Object.keys(firstRow).map((key) => ({
    key,
    label: formatLabel(key),
  }));

  return {
    caption: data.collection?.collectionTitle ?? data.text?.title ?? '',
    columns: JSON.stringify(columns),
    rows: JSON.stringify(rows),
    emptyLabel: data.collection?.collectionDescription ?? 'No data available.',
    striped: 'true',
    bordered: 'true',
    hoverable: 'true',
    compact: 'false',
  };
}
