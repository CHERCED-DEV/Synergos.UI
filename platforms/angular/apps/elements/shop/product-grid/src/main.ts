import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ProductGridComponent } from './product-grid/product-grid';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-product-grid')) {
    customElements.define(
      'synergos-product-grid',
      createCustomElement(ProductGridComponent, { injector: appRef.injector }),
    );
  }
});
