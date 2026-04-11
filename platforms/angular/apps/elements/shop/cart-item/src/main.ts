import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CartItemComponent } from './cart-item/cart-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-cart-item')) {
    customElements.define(
      'synergos-cart-item',
      createCustomElement(CartItemComponent, { injector: appRef.injector }),
    );
  }
});
