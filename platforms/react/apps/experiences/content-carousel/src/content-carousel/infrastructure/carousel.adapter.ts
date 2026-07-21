import type { CarouselConfig } from './carousel.config';
import type { CarouselItem } from '../domain/carousel.domain';

export interface CarouselInstance {
  readonly title: string;
  readonly items: CarouselItem[];
  readonly autoplay: boolean;
  readonly interval: number;
  readonly theme: string;
}

export function adaptCarouselConfig(raw: Partial<CarouselConfig> | undefined): CarouselInstance {
  return {
    title: raw?.title ?? '',
    items: (raw?.items ?? []).map((item) => ({
      title: item.title ?? '',
      body: item.body ?? '',
      image: item.image ?? '',
      ctaLabel: item.ctaLabel ?? '',
      ctaUrl: item.ctaUrl ?? '',
    })),
    autoplay: raw?.autoplay ?? false,
    interval: raw?.interval ?? 4000,
    theme: raw?.theme ?? 'light',
  };
}
