import type { FeatureElementData } from '@synergos/contracts';
import type { FeatureItemInputs } from '../models/feature-item-inputs.model';

export function mapFeatureItemData(data: FeatureElementData): FeatureItemInputs {
  return {
    icon: data.media?.media?.src ?? '',
    headingText: data.text?.title ?? '',
    body: data.text?.body ?? '',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
