import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { DividerComponent } from './divider/divider';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-divider')) {
    const DividerElement = createCustomElement(DividerComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-divider', DividerElement);
  }
});
