import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { PriceDisplayComponent } from './price-display/price-display';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-price-display')) {
    customElements.define(
      'synergos-price-display',
      createCustomElement(PriceDisplayComponent, { injector: appRef.injector }),
    );
  }
});
