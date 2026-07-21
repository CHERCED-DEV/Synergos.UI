import { useEffect, useRef } from 'react';
import { classNames } from '@synergos/shared';
import { useLogger } from '@synergos/core';
import { useCarouselState } from '../application/carousel.state';
import { adaptCarouselConfig } from '../infrastructure/carousel.adapter';
import type { CarouselConfig } from '../infrastructure/carousel.config';

const styles = `
  :host { display: block; }

  .sg-content-carousel {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #0f172a;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  .sg-content-carousel--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-content-carousel__title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    padding: 1.5rem 1.5rem 0;
    letter-spacing: -0.025em;
  }

  .sg-content-carousel__slide {
    padding: 1.5rem;
  }

  .sg-content-carousel__image {
    width: 100%;
    height: 12rem;
    object-fit: cover;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .sg-content-carousel__heading {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }

  .sg-content-carousel__body {
    font-size: 0.875rem;
    line-height: 1.625;
    color: #64748b;
    margin: 0 0 1rem;
  }

  .sg-content-carousel--dark .sg-content-carousel__body {
    color: #94a3b8;
  }

  .sg-content-carousel__cta {
    display: inline-flex;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    background: #0ea5e9;
    color: #ffffff;
    font-weight: 600;
    font-size: 0.875rem;
    text-decoration: none;
    transition: background 0.15s ease;
  }

  .sg-content-carousel__cta:hover {
    background: #0284c7;
  }

  .sg-content-carousel__controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem 1.5rem;
    border-top: 1px solid #e2e8f0;
  }

  .sg-content-carousel--dark .sg-content-carousel__controls {
    border-top-color: #334155;
  }

  .sg-content-carousel__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid #e2e8f0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    transition: background 0.15s ease;
  }

  .sg-content-carousel__btn:hover {
    background: #f1f5f9;
  }

  .sg-content-carousel--dark .sg-content-carousel__btn {
    border-color: #334155;
  }

  .sg-content-carousel--dark .sg-content-carousel__btn:hover {
    background: #334155;
  }

  .sg-content-carousel__dots {
    display: flex;
    gap: 0.375rem;
  }

  .sg-content-carousel__dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    border: none;
    background: #cbd5e1;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .sg-content-carousel__dot--active {
    background: #0ea5e9;
    transform: scale(1.3);
  }
`;

interface ContentCarouselProps {
  config?: string;
}

export function ContentCarousel({ config = '' }: ContentCarouselProps) {
  const logger = useLogger('content-carousel');
  let parsed: Partial<CarouselConfig> = {};
  try {
    parsed = config ? JSON.parse(config) : {};
  } catch {
    logger.warn('Invalid config JSON');
  }

  const { title, items, autoplay, interval, theme } = adaptCarouselConfig(parsed);
  const { activeIndex, total, next, prev, goTo } = useCarouselState(items);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!autoplay || total === 0) return;
    timerRef.current = setInterval(next, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoplay, interval, next, total]);

  const activeItem = items[activeIndex];
  const rootClass = classNames(
    'sg-content-carousel',
    theme === 'dark' && 'sg-content-carousel--dark',
  );

  return (
    <>
      <style>{styles}</style>
      <section className={rootClass}>
        {title && <h2 className="sg-content-carousel__title">{title}</h2>}

        {activeItem && (
          <div className="sg-content-carousel__slide">
            {activeItem.image && (
              <img
                className="sg-content-carousel__image"
                src={activeItem.image}
                alt={activeItem.title}
              />
            )}
            <div className="sg-content-carousel__content">
              {activeItem.title && (
                <h3 className="sg-content-carousel__heading">{activeItem.title}</h3>
              )}
              {activeItem.body && (
                <p className="sg-content-carousel__body">{activeItem.body}</p>
              )}
              {activeItem.ctaLabel && activeItem.ctaUrl && (
                <a className="sg-content-carousel__cta" href={activeItem.ctaUrl}>
                  {activeItem.ctaLabel}
                </a>
              )}
            </div>
          </div>
        )}

        {total > 1 && (
          <div className="sg-content-carousel__controls">
            <button
              className="sg-content-carousel__btn"
              onClick={prev}
              type="button"
              aria-label="Previous"
            >
              ‹
            </button>
            <div className="sg-content-carousel__dots">
              {items.map((_, i) => (
                <button
                  key={i}
                  className={classNames(
                    'sg-content-carousel__dot',
                    i === activeIndex && 'sg-content-carousel__dot--active',
                  )}
                  onClick={() => goTo(i)}
                  type="button"
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
            <button
              className="sg-content-carousel__btn"
              onClick={next}
              type="button"
              aria-label="Next"
            >
              ›
            </button>
          </div>
        )}
      </section>
    </>
  );
}
