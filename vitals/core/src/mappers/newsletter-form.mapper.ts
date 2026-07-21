import type { NewsletterFormElementData } from '@synergos/contracts';
import type { NewsletterFormInputs } from '../models/newsletter-form-inputs.model';

export function mapNewsletterFormData(data: NewsletterFormElementData): NewsletterFormInputs {
  return {
    title: data.text?.title ?? '',
    intro: data.text?.body ?? '',
    placeholder: data.text?.summary ?? 'you@example.com',
    submitLabel: data.cta?.ctaLabel ?? 'Subscribe',
    consentText: data.text?.caption ?? '',
    successMessage: '',
    errorMessage: '',
    actionUrl: data.async?.apiEndpoint ?? data.cta?.ctaLink?.url ?? '',
    method: data.async?.method ?? 'post',
    theme: data.domVariant?.theme ?? 'light',
  };
}
