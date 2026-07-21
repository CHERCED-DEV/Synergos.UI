export function getRatingDescription(value: number, max: number): string {
  if (value === 0 || max === 0) return '';
  const pct = value / max;
  if (pct <= 0.2) return 'Muy bajo';
  if (pct <= 0.4) return 'Bajo';
  if (pct <= 0.6) return 'Regular';
  if (pct <= 0.8) return 'Bueno';
  return 'Excelente';
}
