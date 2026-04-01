import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { BadgeElementComponent } from './badge/badge';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-badge')) {
    const BadgeElement = createCustomElement(BadgeElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-badge', BadgeElement);
  }
});
