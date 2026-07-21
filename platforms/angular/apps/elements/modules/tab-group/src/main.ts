import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { TabGroupElementComponent } from './tab-group/tab-group';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-tab-group')) {
    const TabGroupElement = createCustomElement(TabGroupElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-tab-group', TabGroupElement);
  }
});
