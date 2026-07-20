import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { PriceDisplayComponent } from '@synergos/shop';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-price-display')) {
    customElements.define(
      'synergos-price-display',
      createCustomElement(PriceDisplayComponent, { injector: appRef.injector }),
    );
  }
});
