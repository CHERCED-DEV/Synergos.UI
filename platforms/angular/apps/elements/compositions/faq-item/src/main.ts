import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { FaqItemElementComponent } from './faq-item/faq-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-faq-item')) {
    const FaqItemElement = createCustomElement(FaqItemElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-faq-item', FaqItemElement);
  }
});
