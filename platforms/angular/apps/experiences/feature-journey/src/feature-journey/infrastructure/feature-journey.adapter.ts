import type { FeatureJourneyConfig } from './feature-journey.config';

export interface FeatureJourneyInstance {
  readonly title: string;
  readonly theme: string;
  readonly variant: string;
}

export function adaptFeatureJourneyConfig(config: Partial<FeatureJourneyConfig> | undefined): FeatureJourneyInstance {
  return {
    title: config?.title ?? '',
    theme: config?.theme ?? 'light',
    variant: config?.variant ?? 'default',
  };
}
