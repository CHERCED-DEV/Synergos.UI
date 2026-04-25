import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { IconLabelElementComponent } from './icon-label/icon-label';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-icon-label')) {
    const IconLabelElement = createCustomElement(IconLabelElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-icon-label', IconLabelElement);
  }
});
