import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import type { ComponentTranslations, NewsletterFormElementConfig } from '@synergos/contracts';
import {
  AlertComponent,
  CheckboxComponent,
  HeadingComponent,
  type HeadingTone,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';
type SubmitMethod = 'get' | 'post';

export function normalizeMethod(value: string): SubmitMethod {
  return value.trim().toLowerCase() === 'get' ? 'get' : 'post';
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function sanitizeNewsletterFormConfig(
  value: Partial<NewsletterFormElementConfig>,
): Partial<NewsletterFormElementConfig> {
  const method = coerceTrimmedStringInput(value.method);

  return omitUndefinedProperties<NewsletterFormElementConfig>({
    title: coerceTrimmedStringInput(value.title),
    intro: coerceTrimmedStringInput(value.intro),
    placeholder: coerceTrimmedStringInput(value.placeholder),
    submitLabel: coerceTrimmedStringInput(value.submitLabel),
    consentText: coerceTrimmedStringInput(value.consentText),
    successMessage: coerceTrimmedStringInput(value.successMessage),
    errorMessage: coerceTrimmedStringInput(value.errorMessage),
    actionUrl: coerceTrimmedStringInput(value.actionUrl),
    method: method ? normalizeMethod(method) : undefined,
    theme: coerceTrimmedStringInput(value.theme),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-newsletter-form',
  imports: [
    AlertComponent,
    CheckboxComponent,
    HeadingComponent,
  ],
  templateUrl: './newsletter-form.html',
  styleUrl: './newsletter-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-newsletter-form' },
})
export class NewsletterFormElementComponent {
  readonly #email = signal('');
  readonly #consent = signal(false);
  readonly #state = signal<SubmissionState>('idle');
  readonly #feedback = signal('');

  readonly config = input<Partial<NewsletterFormElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<NewsletterFormElementConfig>(sanitizeNewsletterFormConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly introInput = input<string | undefined>(undefined, { alias: 'intro' });
  readonly placeholderInput = input<string | undefined>(undefined, { alias: 'placeholder' });
  readonly submitLabelInput = input<string | undefined>(undefined, { alias: 'submitLabel' });
  readonly consentTextInput = input<string | undefined>(undefined, { alias: 'consentText' });
  readonly successMessageInput = input<string | undefined>(undefined, { alias: 'successMessage' });
  readonly errorMessageInput = input<string | undefined>(undefined, { alias: 'errorMessage' });
  readonly actionUrlInput = input<string | undefined>(undefined, { alias: 'actionUrl' });
  readonly methodInput = input<string | undefined>(undefined, { alias: 'method' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly intro = computed(() =>
    resolveConfigValue(this.introInput(), this.config()?.intro, ''),
  );
  readonly placeholder = computed(() =>
    resolveConfigValue(this.placeholderInput(), this.config()?.placeholder, 'you@example.com'),
  );
  readonly submitLabel = computed(() =>
    resolveConfigValue(this.submitLabelInput(), this.config()?.submitLabel, 'Subscribe'),
  );
  readonly consentText = computed(() =>
    resolveConfigValue(this.consentTextInput(), this.config()?.consentText, ''),
  );
  readonly successMessage = computed(() =>
    resolveConfigValue(
      this.successMessageInput(),
      this.config()?.successMessage,
      'Subscription completed successfully.',
    ),
  );
  readonly errorMessage = computed(() =>
    resolveConfigValue(
      this.errorMessageInput(),
      this.config()?.errorMessage,
      'Please review your information and try again.',
    ),
  );
  readonly actionUrl = computed(() =>
    resolveConfigValue(this.actionUrlInput(), this.config()?.actionUrl, ''),
  );
  readonly method = computed<SubmitMethod>(() =>
    normalizeMethod(resolveConfigValue(this.methodInput(), this.config()?.method, 'post')),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly translations = computed<ComponentTranslations>(() => this.config()?.translations ?? {});

  readonly email = this.#email.asReadonly();
  readonly consent = this.#consent.asReadonly();
  readonly state = this.#state.asReadonly();
  readonly feedback = this.#feedback.asReadonly();

  readonly hasConsent = computed(() => this.consentText().trim().length > 0);
  readonly isSubmitting = computed(() => this.state() === 'submitting');
  readonly hasFeedback = computed(() => this.feedback().trim().length > 0);
  readonly feedbackTone = computed(() =>
    this.state() === 'success' ? 'brand' : 'critical',
  );
  readonly feedbackTitle = computed(() =>
    this.state() === 'success'
      ? this.translations()['successTitle'] ?? "You're in!"
      : this.translations()['errorTitle'] ?? 'Something went wrong',
  );
  readonly emailAriaLabel = computed(() => this.translations()['emailAriaLabel'] ?? 'Email address');
  readonly noteText = computed(() => this.translations()['noteText'] ?? 'No spam · Unsubscribe anytime');
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(() => `newsletter-form--${this.theme()}`);

  onEmailChange(value: string): void {
    this.#email.set(value);
    this.resetFeedback();
  }

  onConsentChange(value: boolean): void {
    this.#consent.set(value);
    this.resetFeedback();
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isSubmitting()) {
      return;
    }

    const email = this.email().trim();
    if (!isValidEmail(email)) {
      this.#state.set('error');
      this.#feedback.set(this.errorMessage());
      return;
    }

    if (this.hasConsent() && !this.consent()) {
      this.#state.set('error');
      this.#feedback.set(this.errorMessage());
      return;
    }

    this.#state.set('submitting');
    this.#feedback.set('');

    try {
      await this.submitRequest(email);
      this.#state.set('success');
      this.#feedback.set(this.successMessage());
      this.#email.set('');
      this.#consent.set(false);
    } catch {
      this.#state.set('error');
      this.#feedback.set(this.errorMessage());
    }
  }

  private resetFeedback(): void {
    if (this.state() === 'idle') {
      return;
    }

    this.#state.set('idle');
    this.#feedback.set('');
  }

  private async submitRequest(email: string): Promise<void> {
    const actionUrl = this.actionUrl().trim();
    if (!actionUrl) {
      return;
    }

    const method = this.method();
    const payload = {
      email,
      consent: this.consent(),
    };

    let response: Response;
    if (method === 'get') {
      const url = new URL(actionUrl, window.location.origin);
      url.searchParams.set('email', email);
      url.searchParams.set('consent', `${this.consent()}`);
      response = await fetch(url.toString(), { method: 'GET' });
    } else {
      response = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      throw new Error('Request failed');
    }
  }
}
