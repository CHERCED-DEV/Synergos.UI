import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CtaGroupComponent } from './cta-group/cta-group';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-cta-group')) {
    const CtaGroupElement = createCustomElement(CtaGroupComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-cta-group', CtaGroupElement);
  }
});
