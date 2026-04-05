import type { ContentCarouselInputs } from '../models/content-carousel-inputs.model';

export function mapContentCarouselData(data: Record<string, unknown>): ContentCarouselInputs {
  return { config: JSON.stringify(data) };
}
