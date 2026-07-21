import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ShareBarElementComponent } from './share-bar/share-bar';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-share-bar')) {
    const ShareBarElement = createCustomElement(ShareBarElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-share-bar', ShareBarElement);
  }
});
