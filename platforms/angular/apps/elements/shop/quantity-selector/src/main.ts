import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { QuantitySelectorComponent } from './quantity-selector/quantity-selector';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-quantity-selector')) {
    customElements.define(
      'synergos-quantity-selector',
      createCustomElement(QuantitySelectorComponent, { injector: appRef.injector }),
    );
  }
});
