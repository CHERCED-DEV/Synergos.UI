import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { AngularHostElementComponent } from './angular-host/angular-host';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-angular-host')) {
    const AngularHostElement = createCustomElement(AngularHostElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-angular-host', AngularHostElement);
  }
});
