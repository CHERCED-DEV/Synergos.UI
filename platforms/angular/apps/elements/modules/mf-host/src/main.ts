import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { MfHostElementComponent } from './mf-host/mf-host';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-mf-host')) {
    const MfHostElement = createCustomElement(MfHostElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-mf-host', MfHostElement);
  }
});
