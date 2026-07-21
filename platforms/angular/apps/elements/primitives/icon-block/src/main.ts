import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { IconBlockComponent } from './icon-block/icon-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-icon-block')) {
    const IconBlockElement = createCustomElement(IconBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-icon-block', IconBlockElement);
  }
});
