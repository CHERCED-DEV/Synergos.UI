import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { IframeEmbedElementComponent } from './iframe-embed/iframe-embed';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-iframe-embed')) {
    const IframeEmbedElement = createCustomElement(IframeEmbedElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-iframe-embed', IframeEmbedElement);
  }
});
