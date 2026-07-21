import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { RealtyElementComponent } from './realty/realty';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-realty')) {
    const RealtyElement = createCustomElement(RealtyElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-realty', RealtyElement);
  }
});
