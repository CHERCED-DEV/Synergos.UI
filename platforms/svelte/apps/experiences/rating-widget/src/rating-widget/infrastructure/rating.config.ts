export interface RatingConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly max?: number;
  readonly labels?: readonly string[];
  readonly theme?: string;
}
