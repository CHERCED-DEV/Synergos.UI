import type { TabGroupElementData } from '@synergos/contracts';
import type { TabGroupInputs } from '../models/tab-group-inputs.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function mapTabGroupData(data: TabGroupElementData): TabGroupInputs {
  const rawItems = data.collection?.items ?? [];
  const tabs = rawItems
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = isRecord(item['text']) ? item['text'] : undefined;
      const domAttributes = isRecord(item['domAttributes']) ? item['domAttributes'] : undefined;
      const interaction = isRecord(item['interaction']) ? item['interaction'] : undefined;
      const label = readString(text?.['title']).trim();
      const content = readString(text?.['body']).trim() || readString(text?.['summary']).trim();

      if (!label && !content) {
        return null;
      }

      return {
        id: readString(domAttributes?.['elementId']).trim() || `tab-${index + 1}`,
        label,
        content,
        disabled: interaction?.['isDisabled'] === true || item['disabled'] === true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    title: data.collection?.collectionTitle ?? data.text?.title ?? '',
    tabs: JSON.stringify(tabs),
    activeId: tabs[0]?.id ?? '',
    ariaLabel: data.collection?.collectionTitle ?? data.text?.title ?? 'Tabs',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
