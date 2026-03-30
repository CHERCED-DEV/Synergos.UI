import type { TestimonialListElementData } from '@synergos/contracts';
import type { TestimonialSectionInputs } from '../models/testimonial-section-inputs.model';

export function mapTestimonialSectionData(data: TestimonialListElementData): TestimonialSectionInputs {
  const rawItems = data.collection?.items ?? [];
  const items = rawItems.map((item: Record<string, unknown>) => {
    const text = item['text'] as Record<string, unknown> | undefined;
    const author = item['author'] as Record<string, unknown> | undefined;
    const authorImage = author?.['authorImage'] as Record<string, unknown> | undefined;
    return {
      quote: text?.['body'] ?? '',
      name: author?.['authorName'] ?? '',
      role: author?.['authorRole'] ?? '',
      avatarSrc: authorImage?.['src'] ?? '',
    };
  });

  return {
    headingText: data.collection?.collectionTitle ?? '',
    items: JSON.stringify(items),
    theme: data.domVariant?.theme ?? 'light',
  };
}
