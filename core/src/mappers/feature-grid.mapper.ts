import type { FeatureGridElementData } from '@synergos/contracts';
import type { FeatureGridInputs } from '../models/feature-grid-inputs.model';

export function mapFeatureGridData(data: FeatureGridElementData): FeatureGridInputs {
  const rawItems = data.collection?.items ?? [];
  const items = rawItems.map((item: Record<string, unknown>) => {
    const text = item['text'] as Record<string, unknown> | undefined;
    const media = item['media'] as Record<string, unknown> | undefined;
    const mediaInner = media?.['media'] as Record<string, unknown> | undefined;
    return {
      icon: mediaInner?.['src'] ?? '',
      heading: text?.['title'] ?? '',
      body: text?.['body'] ?? '',
    };
  });

  return {
    headingText: data.collection?.collectionTitle ?? '',
    columns: String(3),
    items: JSON.stringify(items),
    theme: data.domVariant?.theme ?? 'light',
  };
}
