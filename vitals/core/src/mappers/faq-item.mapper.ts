import type { FaqItemElementData } from '@synergos/contracts';
import type { FaqItemInputs } from '../models/faq-item-inputs.model';

export function mapFaqItemData(data: FaqItemElementData): FaqItemInputs {
  return {
    question: data.text?.title ?? '',
    answer: data.text?.body ?? '',
    initiallyExpanded: 'false',
    theme: data.domVariant?.theme ?? 'light',
  };
}
