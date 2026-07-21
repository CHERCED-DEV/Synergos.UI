import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { DrawerElementComponent } from './drawer/drawer';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-drawer')) {
    const DrawerElement = createCustomElement(DrawerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-drawer', DrawerElement);
  }
});
