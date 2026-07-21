import type { BaseElementData, ContentHeading, ContentText } from '@synergos/contracts';
import type { TextBlockInputs } from '../models/text-block-inputs.model';

interface TextBlockElementData extends BaseElementData {
  heading?: ContentHeading;
  text?: ContentText;
}

export function mapTextBlockData(data: TextBlockElementData): TextBlockInputs {
  return {
    headingText: data.heading?.headingText ?? '',
    headingLevel: data.heading?.headingLevel ?? 'h2',
    body: data.text?.body ?? '',
    alignment: data.domLayout?.alignment ?? 'left',
    theme: data.domVariant?.theme ?? 'light',
  };
}
