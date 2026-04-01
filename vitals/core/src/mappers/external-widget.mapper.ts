import type { ExternalWidgetElementData } from '@synergos/contracts';
import type { ExternalWidgetInputs } from '../models/external-widget-inputs.model';

export function mapExternalWidgetData(data: ExternalWidgetElementData): ExternalWidgetInputs {
  return {
    tagName: data.embed?.embedType ?? 'div',
    scriptSrc: data.embed?.embedUrl ?? '',
    props: '{}',
    textContent: data.embed?.embedTitle ?? '',
  };
}
