import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { NewsletterFormElementComponent } from './newsletter-form/newsletter-form';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-newsletter-form')) {
    const NewsletterFormElement = createCustomElement(NewsletterFormElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-newsletter-form', NewsletterFormElement);
  }
});
