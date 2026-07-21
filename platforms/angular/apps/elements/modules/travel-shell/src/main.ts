import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TravelShellElementComponent } from './travel-shell/travel-shell';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-travel-shell')) {
    const TravelShellElement = createCustomElement(TravelShellElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-travel-shell', TravelShellElement);
  }
});
