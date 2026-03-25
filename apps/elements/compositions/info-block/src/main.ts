import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { InfoBlockComponent } from './info-block/info-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-info-block')) {
    const InfoBlockElement = createCustomElement(InfoBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-info-block', InfoBlockElement);
  }
});
