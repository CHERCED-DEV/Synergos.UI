import type { ExternalWidgetElementData } from '@synergos/contracts';
import type { ExternalWidgetInputs } from '../models/external-widget-inputs.model';

export function mapExternalWidgetData(data: ExternalWidgetElementData): ExternalWidgetInputs {
  return {
    src: data.embed?.embedUrl ?? '',
    type: data.embed?.embedType ?? '',
    title: data.embed?.embedTitle ?? '',
    endpoint: data.async?.apiEndpoint ?? '',
    tagName: '',
    scriptSrc: '',
    props: '{}',
    textContent: '',
  };
}
