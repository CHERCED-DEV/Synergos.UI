import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { PaxSelectorElementComponent } from './pax-selector/pax-selector';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-pax-selector')) {
    const PaxSelectorElement = createCustomElement(PaxSelectorElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-pax-selector', PaxSelectorElement);
  }
});
