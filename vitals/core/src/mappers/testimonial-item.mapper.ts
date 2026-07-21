import type { TestimonialItemElementData } from '@synergos/contracts';
import type { TestimonialItemInputs } from '../models/testimonial-item-inputs.model';

export function mapTestimonialItemData(data: TestimonialItemElementData): TestimonialItemInputs {
  return {
    quote: data.text?.body ?? data.text?.summary ?? '',
    name: data.author?.authorName ?? '',
    role: data.author?.authorRole ?? '',
    avatarSrc: data.author?.authorImage?.src ?? data.media?.media?.src ?? '',
    avatarAlt: data.author?.authorImage?.alt ?? data.media?.altText ?? '',
    theme: data.domVariant?.theme ?? 'light',
  };
}
