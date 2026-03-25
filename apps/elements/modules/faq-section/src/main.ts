import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FaqSectionComponent } from './faq-section/faq-section';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-faq-section')) {
    const FaqSectionElement = createCustomElement(FaqSectionComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-faq-section', FaqSectionElement);
  }
});
