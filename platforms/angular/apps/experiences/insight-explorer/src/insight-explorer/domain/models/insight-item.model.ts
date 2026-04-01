export interface InsightMetric {
  readonly label: string;
  readonly value: string;
}

export interface InsightItem {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly metrics: readonly InsightMetric[];
  readonly ctaLabel: string;
  readonly ctaUrl: string;
}
