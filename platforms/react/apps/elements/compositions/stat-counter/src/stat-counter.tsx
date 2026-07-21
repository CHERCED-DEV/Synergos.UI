import { classNames } from '@synergos/shared';

interface StatCounterProps {
  value: string;
  label: string;
  prefix: string;
  suffix: string;
  icon: string;
  trend: string;
  trendLabel: string;
  variant: string;
  theme: string;
}

const styles = `
  :host { display: block; }

  .sg-stat-counter {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
    text-align: center;
    background: #ffffff;
    color: #0f172a;
    border-radius: 0.75rem;
  }

  .sg-stat-counter--card {
    border: 1px solid #e2e8f0;
    box-shadow: 0 0.125rem 0.25rem 0 rgb(15 23 42 / 0.1);
  }

  .sg-stat-counter--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-stat-counter__icon {
    font-size: 1.5rem;
    color: #0ea5e9;
    margin-bottom: 0.25rem;
  }

  .sg-stat-counter__value-group {
    display: flex;
    align-items: baseline;
    gap: 0.125rem;
  }

  .sg-stat-counter__prefix,
  .sg-stat-counter__suffix {
    font-size: 1.5rem;
    font-weight: 600;
    color: #64748b;
  }

  .sg-stat-counter--dark .sg-stat-counter__prefix,
  .sg-stat-counter--dark .sg-stat-counter__suffix {
    color: #94a3b8;
  }

  .sg-stat-counter__value {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.025em;
  }

  .sg-stat-counter__label {
    font-size: 0.875rem;
    color: #64748b;
    font-weight: 500;
  }

  .sg-stat-counter--dark .sg-stat-counter__label {
    color: #94a3b8;
  }

  .sg-stat-counter__trend {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
  }

  .sg-stat-counter__trend--up {
    color: #16a34a;
    background: #f0fdf4;
  }

  .sg-stat-counter__trend--down {
    color: #dc2626;
    background: #fef2f2;
  }

  .sg-stat-counter__trend--neutral {
    color: #64748b;
    background: #f1f5f9;
  }
`;

export function StatCounter(props: StatCounterProps) {
  const {
    value = '0',
    label = '',
    prefix = '',
    suffix = '',
    icon = '',
    trend = '',
    trendLabel = '',
    variant = 'default',
    theme = 'light',
  } = props;

  const hasTrend = trend && trendLabel;

  const trendDirection =
    trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'neutral';

  const trendSymbol = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  const rootClass = classNames(
    'sg-stat-counter',
    variant !== 'default' && `sg-stat-counter--${variant}`,
    theme === 'dark' && 'sg-stat-counter--dark',
  );

  return (
    <>
      <style>{styles}</style>
      <div className={rootClass}>
        {icon && <span className="sg-stat-counter__icon">{icon}</span>}

        <div className="sg-stat-counter__value-group">
          {prefix && <span className="sg-stat-counter__prefix">{prefix}</span>}
          <span className="sg-stat-counter__value">{value}</span>
          {suffix && <span className="sg-stat-counter__suffix">{suffix}</span>}
        </div>

        {label && <p className="sg-stat-counter__label">{label}</p>}

        {hasTrend && (
          <span className={`sg-stat-counter__trend sg-stat-counter__trend--${trendDirection}`}>
            {trendSymbol} {trendLabel}
          </span>
        )}
      </div>
    </>
  );
}
