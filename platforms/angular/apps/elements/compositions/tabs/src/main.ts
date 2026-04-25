import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TabsElementComponent } from './tabs/tabs';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-tabs')) {
    const TabsElement = createCustomElement(TabsElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-tabs', TabsElement);
  }
});
