import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FabElementComponent } from './fab/fab';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-fab')) {
    const FabElement = createCustomElement(FabElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-fab', FabElement);
  }
});
