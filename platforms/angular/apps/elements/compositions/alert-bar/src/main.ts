import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { AlertBarElementComponent } from './alert-bar/alert-bar';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-alert-bar')) {
    const AlertBarElement = createCustomElement(AlertBarElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-alert-bar', AlertBarElement);
  }
});
