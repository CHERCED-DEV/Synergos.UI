import { classNames } from '@synergos/shared';

interface PricingCardProps {
  planName: string;
  price: string;
  period: string;
  features: string;
  ctaLabel: string;
  ctaUrl: string;
  highlighted: string;
  variant: string;
  theme: string;
}

const styles = `
  :host { display: block; }

  .sg-pricing-card {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: #ffffff;
    color: #0f172a;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }

  .sg-pricing-card:hover {
    box-shadow: 0 0.75rem 1.5rem -0.25rem rgb(15 23 42 / 0.16);
  }

  .sg-pricing-card--highlighted {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 2px #0ea5e9;
  }

  .sg-pricing-card--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-pricing-card__plan {
    font-size: 1.125rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sg-pricing-card--dark .sg-pricing-card__plan {
    color: #94a3b8;
  }

  .sg-pricing-card__price-group {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .sg-pricing-card__price {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.025em;
  }

  .sg-pricing-card__period {
    font-size: 0.875rem;
    color: #64748b;
  }

  .sg-pricing-card--dark .sg-pricing-card__period {
    color: #94a3b8;
  }

  .sg-pricing-card__features {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
  }

  .sg-pricing-card__feature {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .sg-pricing-card__check {
    color: #0ea5e9;
    flex-shrink: 0;
    font-weight: 700;
  }

  .sg-pricing-card__cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    text-decoration: none;
    transition: background 0.15s ease;
    background: #0ea5e9;
    color: #ffffff;
    border: none;
    cursor: pointer;
  }

  .sg-pricing-card__cta:hover {
    background: #0284c7;
  }

  .sg-pricing-card--outlined .sg-pricing-card__cta {
    background: transparent;
    border: 2px solid #0ea5e9;
    color: #0ea5e9;
  }

  .sg-pricing-card--outlined .sg-pricing-card__cta:hover {
    background: #e0f2fe;
  }
`;

export function PricingCard(props: PricingCardProps) {
  const {
    planName = '',
    price = '',
    period = '/mo',
    features = '[]',
    ctaLabel = '',
    ctaUrl = '',
    highlighted = 'false',
    variant = 'default',
    theme = 'light',
  } = props;

  let parsedFeatures: string[] = [];
  try {
    parsedFeatures = JSON.parse(features);
  } catch {
    parsedFeatures = [];
  }

  const isHighlighted = highlighted === 'true';
  const hasCta = ctaLabel && ctaUrl;

  const rootClass = classNames(
    'sg-pricing-card',
    isHighlighted && 'sg-pricing-card--highlighted',
    variant !== 'default' && `sg-pricing-card--${variant}`,
    theme === 'dark' && 'sg-pricing-card--dark',
  );

  return (
    <>
      <style>{styles}</style>
      <article className={rootClass}>
        {planName && <p className="sg-pricing-card__plan">{planName}</p>}

        {price && (
          <div className="sg-pricing-card__price-group">
            <span className="sg-pricing-card__price">{price}</span>
            {period && <span className="sg-pricing-card__period">{period}</span>}
          </div>
        )}

        {parsedFeatures.length > 0 && (
          <ul className="sg-pricing-card__features">
            {parsedFeatures.map((feature, i) => (
              <li key={i} className="sg-pricing-card__feature">
                <span className="sg-pricing-card__check">✓</span>
                {feature}
              </li>
            ))}
          </ul>
        )}

        {hasCta && (
          <a href={ctaUrl} className="sg-pricing-card__cta">
            {ctaLabel}
          </a>
        )}
      </article>
    </>
  );
}
