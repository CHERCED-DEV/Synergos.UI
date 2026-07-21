import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SellerElementComponent } from './seller/seller';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-seller')) {
    const SellerElement = createCustomElement(SellerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-seller', SellerElement);
  }
});
