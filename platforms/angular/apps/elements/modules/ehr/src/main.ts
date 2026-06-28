import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { EhrElementComponent } from './ehr/ehr';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-ehr')) {
    const EhrElement = createCustomElement(EhrElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-ehr', EhrElement);
  }
});
