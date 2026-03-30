import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CardComponent } from './card/card';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-card')) {
    const CardElement = createCustomElement(CardComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-card', CardElement);
  }
});
