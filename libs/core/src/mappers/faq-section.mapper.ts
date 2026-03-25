import type { FaqListElementData } from '../contracts/elements.contract';
import type { FaqSectionInputs } from '../models/faq-section-inputs.model';

export function mapFaqSectionData(data: FaqListElementData): FaqSectionInputs {
  const rawItems = data.collection?.items ?? [];
  const items = rawItems.map((item: Record<string, unknown>) => {
    const text = item['text'] as Record<string, unknown> | undefined;
    return {
      question: text?.['title'] ?? '',
      answer: text?.['body'] ?? '',
    };
  });

  return {
    headingText: data.collection?.collectionTitle ?? '',
    items: JSON.stringify(items),
    theme: data.domVariant?.theme ?? 'light',
  };
}
