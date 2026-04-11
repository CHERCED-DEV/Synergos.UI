import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ProductCardComponent } from './product-card/product-card';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-product-card')) {
    const ProductCardElement = createCustomElement(ProductCardComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-product-card', ProductCardElement);
  }
});
