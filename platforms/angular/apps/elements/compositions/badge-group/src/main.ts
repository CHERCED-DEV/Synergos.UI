import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { BadgeGroupElementComponent } from './badge-group/badge-group';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-badge-group')) {
    const BadgeGroupElement = createCustomElement(BadgeGroupElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-badge-group', BadgeGroupElement);
  }
});
