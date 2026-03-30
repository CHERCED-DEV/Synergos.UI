export interface ButtonProps {
  label: string;
  href?: string;
  target?: string;
  variant?: 'solid' | 'outlined' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Manrope', 'Segoe UI', sans-serif",
    fontWeight: 600,
    borderRadius: '0.5rem',
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s ease, opacity 0.15s ease',
  },
  sm: { padding: '0.375rem 0.75rem', fontSize: '0.75rem' },
  md: { padding: '0.625rem 1.25rem', fontSize: '0.875rem' },
  lg: { padding: '0.75rem 1.5rem', fontSize: '1rem' },
  solid: { background: '#0ea5e9', color: '#ffffff' },
  outlined: { background: 'transparent', border: '2px solid #0ea5e9', color: '#0ea5e9' },
  ghost: { background: 'transparent', color: '#0ea5e9' },
};

export function Button({
  label,
  href,
  target = '_self',
  variant = 'solid',
  size = 'md',
  disabled = false,
}: ButtonProps) {
  const style = { ...styles.base, ...styles[size], ...styles[variant] };

  if (href) {
    return (
      <a href={href} target={target} style={style} rel="noopener noreferrer">
        {label}
      </a>
    );
  }

  return (
    <button type="button" style={style} disabled={disabled}>
      {label}
    </button>
  );
}
