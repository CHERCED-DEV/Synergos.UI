import type { FeatureJourneyElementData } from '@synergos/contracts';
import type { FeatureJourneyInputs } from '../models/feature-journey-inputs.model';

export function mapFeatureJourneyData(data: FeatureJourneyElementData): FeatureJourneyInputs {
  return {
    title: data.text?.title ?? '',
    theme: data.domVariant?.theme ?? 'light',
    variant: data.domVariant?.variant ?? 'default',
    elementId: data.domAttributes?.elementId ?? '',
  };
}
