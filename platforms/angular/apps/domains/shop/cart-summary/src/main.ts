import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CartSummaryComponent } from './cart-summary/cart-summary';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-cart-summary')) {
    customElements.define(
      'synergos-cart-summary',
      createCustomElement(CartSummaryComponent, { injector: appRef.injector }),
    );
  }
});
