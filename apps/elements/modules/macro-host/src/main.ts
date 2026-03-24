import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { MacroHostComponent } from './macro-host/macro-host';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-macro-host')) {
    const MacroHostElement = createCustomElement(MacroHostComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-macro-host', MacroHostElement);
  }
});
