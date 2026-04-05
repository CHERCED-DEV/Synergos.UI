export interface RatingLabel {
  readonly value: number;
  readonly label: string;
}

export function buildDefaultLabels(max: number): RatingLabel[] {
  return Array.from({ length: max }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
  }));
}
