import React from 'react';

interface HeroProps {
  headingText?: string;
  headingLevel?: string;
  body?: string;
  imageSrc?: string;
  imageAlt?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaTarget?: string;
  variant?: string;
  theme?: string;
}

export function Hero({
  headingText = '',
  headingLevel = 'h1',
  body = '',
  imageSrc = '',
  ctaLabel = '',
  ctaUrl = '',
  ctaTarget = '_self',
  variant = 'default',
  theme = 'light',
}: HeroProps) {
  const hasImage = !!imageSrc;
  const hasCta = !!ctaLabel && !!ctaUrl;
  const hostClasses = `hero sg-hero--${variant} sg-hero--${theme}`;

  const HeadingTag = (['h1', 'h2', 'h3'].includes(headingLevel) ? headingLevel : 'h1') as keyof React.JSX.IntrinsicElements;

  return (
    <section
      className={hostClasses}
      style={hasImage ? { backgroundImage: `url(${imageSrc})` } : undefined}
    >
      <div className="hero__content">
        {headingText && <HeadingTag className="hero__heading">{headingText}</HeadingTag>}
        {body && <p className="hero__body">{body}</p>}
        {hasCta && (
          <a className="hero__cta-link" href={ctaUrl} target={ctaTarget} rel="noopener noreferrer">
            <button className="syn-button syn-button--solid syn-button--lg">{ctaLabel}</button>
          </a>
        )}
      </div>
    </section>
  );
}
