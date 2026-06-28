import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { StorefrontElementComponent } from './storefront/storefront';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-storefront')) {
    const StorefrontElement = createCustomElement(StorefrontElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-storefront', StorefrontElement);
  }
});
