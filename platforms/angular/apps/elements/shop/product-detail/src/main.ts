import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ProductDetailComponent } from './product-detail/product-detail';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-product-detail')) {
    customElements.define(
      'synergos-product-detail',
      createCustomElement(ProductDetailComponent, { injector: appRef.injector }),
    );
  }
});
