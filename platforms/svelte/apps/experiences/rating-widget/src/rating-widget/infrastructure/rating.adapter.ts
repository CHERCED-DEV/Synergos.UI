import type { RatingConfig } from './rating.config';
import { buildDefaultLabels } from '../domain/rating.domain';
import type { RatingLabel } from '../domain/rating.domain';

export interface RatingInstance {
  readonly title: string;
  readonly subtitle: string;
  readonly max: number;
  readonly labels: RatingLabel[];
  readonly theme: string;
}

export function adaptRatingConfig(raw: Partial<RatingConfig> | undefined): RatingInstance {
  const max = raw?.max ?? 5;
  const rawLabels = raw?.labels ?? [];
  const labels: RatingLabel[] =
    rawLabels.length > 0
      ? rawLabels.map((l, i) => ({ value: i + 1, label: l }))
      : buildDefaultLabels(max);

  return {
    title: raw?.title ?? '',
    subtitle: raw?.subtitle ?? '',
    max,
    labels,
    theme: raw?.theme ?? 'light',
  };
}
