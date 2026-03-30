import type { BaseElementData, ContentHeading, ContentText } from '@synergos/contracts';
import type { AccordionInputs } from '../models/accordion-inputs.model';

interface AccordionElementData extends BaseElementData {
  heading?: ContentHeading;
  text?: ContentText;
}

export function mapAccordionData(data: AccordionElementData): AccordionInputs {
  return {
    heading: data.heading?.headingText ?? '',
    body: data.text?.body ?? '',
    icon: '▸',
    variant: data.domVariant?.variant ?? 'default',
    theme: data.domVariant?.theme ?? 'light',
  };
}
