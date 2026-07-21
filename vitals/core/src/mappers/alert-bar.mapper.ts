import type { AlertBarElementData } from '@synergos/contracts';
import type { AlertBarInputs } from '../models/alert-bar-inputs.model';

export function mapAlertBarData(data: AlertBarElementData): AlertBarInputs {
  return {
    title: data.text?.title ?? '',
    description: data.text?.body ?? '',
    ctaLabel: data.cta?.ctaLabel ?? '',
    ctaUrl: data.cta?.ctaLink?.url ?? '',
    tone: data.domVariant?.variant ?? 'neutral',
    dismissible: 'true',
  };
}
