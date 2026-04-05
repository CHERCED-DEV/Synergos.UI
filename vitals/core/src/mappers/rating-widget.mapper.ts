import type { RatingWidgetInputs } from '../models/rating-widget-inputs.model';

export function mapRatingWidgetData(data: Record<string, unknown>): RatingWidgetInputs {
  return { config: JSON.stringify(data) };
}
