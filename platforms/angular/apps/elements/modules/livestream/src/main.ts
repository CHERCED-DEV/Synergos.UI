import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { LivestreamElementComponent } from './livestream/livestream';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-livestream')) {
    const LivestreamElement = createCustomElement(LivestreamElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-livestream', LivestreamElement);
  }
});
