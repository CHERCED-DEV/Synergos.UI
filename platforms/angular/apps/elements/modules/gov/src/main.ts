import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { GovElementComponent } from './gov/gov';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-gov')) {
    const GovElement = createCustomElement(GovElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-gov', GovElement);
  }
});
