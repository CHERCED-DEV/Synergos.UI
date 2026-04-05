import { useState, useCallback } from 'react';
import type { CarouselItem } from '../domain/carousel.domain';

export interface CarouselState {
  activeIndex: number;
  total: number;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

export function useCarouselState(items: CarouselItem[]): CarouselState {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = items.length;

  const next = useCallback(() => {
    setActiveIndex((i) => (total > 0 ? (i + 1) % total : 0));
  }, [total]);

  const prev = useCallback(() => {
    setActiveIndex((i) => (total > 0 ? (i - 1 + total) % total : 0));
  }, [total]);

  const goTo = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  return { activeIndex, total, next, prev, goTo };
}
